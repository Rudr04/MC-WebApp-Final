const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');
const { FIREBASE_PATHS } = require('../config/constants');
const heartbeatConfig = require('../config/heartbeat');

class SessionMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitorTimer = null;
    this.config = heartbeatConfig;
  }

  start() {
    if (this.isMonitoring) {
      logger.warn('Session monitor already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting session monitor...');
    
    // Start immediate check, then regular intervals
    this.checkSessions();
    this.monitorTimer = setInterval(() => {
      this.checkSessions();
    }, this.config.MONITOR_INTERVAL);
    
    logger.info(`Session monitor started - checking every ${this.config.MONITOR_INTERVAL / 1000}s`);
  }

  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    
    logger.info('Session monitor stopped');
  }

  async checkSessions() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      logger.info('Starting session cleanup check...');
      const startTime = Date.now();
      
      // Get all users and their heartbeat data
      const usersSnapshot = await db.ref(FIREBASE_PATHS.USERS).once('value');
      const users = usersSnapshot.val() || {};
      
      const userIds = Object.keys(users);
      if (userIds.length === 0) {
        logger.info('No users to check');
        return;
      }
      
      logger.info(`Checking ${userIds.length} users for heartbeat timeouts`);
      
      // Process users in batches to avoid overwhelming Firebase
      const batches = this.createBatches(userIds, this.config.BATCH_SIZE);
      let totalProcessed = 0;
      let totalCleaned = 0;
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const { processed, cleaned } = await this.processBatch(batch, users);
        
        totalProcessed += processed;
        totalCleaned += cleaned;
        
        // Add delay between batches to prevent rate limiting
        if (i < batches.length - 1) {
          await this.delay(this.config.BATCH_DELAY);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`Session cleanup completed: ${totalProcessed} users checked, ${totalCleaned} sessions cleaned up in ${duration}ms`);
      
    } catch (error) {
      logger.error('Session monitor error:', error);
    }
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  async processBatch(userIds, usersData) {
    let processed = 0;
    let cleaned = 0;
    const now = Date.now();
    const sessionsToClean = [];
    
    // Identify sessions that need cleanup
    for (const userId of userIds) {
      processed++;
      const userData = usersData[userId];
      
      if (!userData) {
        continue;
      }
      
      // Check if session should be cleaned up
      const shouldCleanup = this.shouldCleanupSession(userData, now);
      
      if (shouldCleanup) {
        sessionsToClean.push({
          userId,
          userData,
          reason: shouldCleanup.reason,
          timeout: shouldCleanup.timeout
        });
      }
    }
    
    // Clean up identified sessions
    if (sessionsToClean.length > 0) {
      cleaned = await this.cleanupSessions(sessionsToClean);
    }
    
    return { processed, cleaned };
  }

  shouldCleanupSession(userData, now) {
    // Check for beacon-marked sessions (immediate cleanup)
    if (userData.beaconReceived) {
      return {
        reason: 'beacon_received',
        timeout: 0
      };
    }
    
    // Check heartbeat timeout based on user state
    const lastHeartbeat = userData.lastHeartbeat || userData.timestamp || 0;
    const timeSinceHeartbeat = now - lastHeartbeat;
    const userState = userData.userState || 'active';
    
    const timeout = this.config.TIMEOUTS[userState.toUpperCase()] || this.config.TIMEOUTS.ACTIVE;
    
    if (timeSinceHeartbeat > timeout) {
      return {
        reason: 'heartbeat_timeout',
        timeout: timeout
      };
    }
    
    return null;
  }

  async cleanupSessions(sessionsToClean) {
    let cleaned = 0;
    
    // Group sessions by role for atomic operations
    const participantSessions = [];
    const hostSessions = [];
    
    for (const session of sessionsToClean) {
      const { userData } = session;
      if (userData.role === 'participant') {
        participantSessions.push(session);
      } else {
        hostSessions.push(session);
      }
    }
    
    // Clean up participant sessions
    if (participantSessions.length > 0) {
      cleaned += await this.cleanupParticipantSessions(participantSessions);
    }
    
    // Clean up host sessions
    if (hostSessions.length > 0) {
      cleaned += await this.cleanupHostSessions(hostSessions);
    }
    
    return cleaned;
  }

  async cleanupParticipantSessions(sessions) {
    let cleaned = 0;
    
    for (const session of sessions) {
      try {
        const { userId, userData, reason, timeout } = session;
        
        // Use atomic transaction to remove participant session and update counter
        await db.ref().transaction((current) => {
          if (current === null) current = {};
          
          // Remove from active sessions if exists
          if (current[FIREBASE_PATHS.ACTIVE_SESSIONS] && current[FIREBASE_PATHS.ACTIVE_SESSIONS][userId]) {
            delete current[FIREBASE_PATHS.ACTIVE_SESSIONS][userId];
            
            // Decrement participant count atomically
            current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] = Math.max(0, 
              (current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] || 0) - 1);
          }
          
          // Remove from users
          if (current[FIREBASE_PATHS.USERS] && current[FIREBASE_PATHS.USERS][userId]) {
            delete current[FIREBASE_PATHS.USERS][userId];
          }
          
          return current;
        });
        
        cleaned++;
        logger.info(`Cleaned up participant ${userData.name || userId} (${reason}, timeout: ${timeout}ms)`);
        
      } catch (error) {
        logger.error(`Failed to cleanup participant session ${session.userId}:`, error);
      }
    }
    
    return cleaned;
  }

  async cleanupHostSessions(sessions) {
    let cleaned = 0;
    
    for (const session of sessions) {
      try {
        const { userId, userData, reason, timeout } = session;
        
        // Use atomic transaction to remove host session and update counter
        await db.ref().transaction((current) => {
          if (current === null) current = {};
          
          // Remove from active hosts if exists
          if (current[FIREBASE_PATHS.ACTIVE_HOSTS] && current[FIREBASE_PATHS.ACTIVE_HOSTS][userId]) {
            delete current[FIREBASE_PATHS.ACTIVE_HOSTS][userId];
            
            // Decrement host count atomically
            current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] = Math.max(0, 
              (current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] || 0) - 1);
          }
          
          // Remove from users
          if (current[FIREBASE_PATHS.USERS] && current[FIREBASE_PATHS.USERS][userId]) {
            delete current[FIREBASE_PATHS.USERS][userId];
          }
          
          return current;
        });
        
        cleaned++;
        logger.info(`Cleaned up host ${userData.name || userId} (${reason}, timeout: ${timeout}ms)`);
        
      } catch (error) {
        logger.error(`Failed to cleanup host session ${session.userId}:`, error);
      }
    }
    
    return cleaned;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public method to get monitor status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      config: this.config,
      nextCheck: this.monitorTimer ? 'Running' : 'Stopped'
    };
  }

  // Public method to force an immediate check (for testing/debugging)
  async forceCheck() {
    if (!this.isMonitoring) {
      throw new Error('Session monitor is not running');
    }
    
    logger.info('Forcing immediate session check...');
    await this.checkSessions();
  }
}

// Export singleton instance
module.exports = new SessionMonitor();