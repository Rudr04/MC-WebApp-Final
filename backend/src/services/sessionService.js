const { FIREBASE_PATHS } = require('../config/constants');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class SessionService {
  constructor() {
    // Start cleanup jobs
    this.startCleanupJobs();
  }

  // Helper methods for indexed queries
  async getUsersByState(userType, state) {
    logger.debug(`Querying ${userType} with state: ${state}`);
    const snapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${userType}`)
      .orderByChild('state')
      .equalTo(state)
      .once('value');
    return snapshot;
  }

  async getUsersByStateOlderThan(userType, state, timestamp) {
    logger.debug(`Querying ${userType} with state '${state}' older than ${timestamp}`);
    const snapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${userType}`)
      .orderByChild('state')
      .equalTo(state)
      .once('value');
    
    // Client-side filtering for timestamp since Firebase doesn't support compound queries
    const filteredResults = {};
    snapshot.forEach(child => {
      const userData = child.val();
      if (userData.stateUpdatedAt <= timestamp) {
        filteredResults[child.key] = userData;
      }
    });
    return filteredResults;
  }

  async getRecentlyActiveUsers(userType, sinceTimestamp) {
    logger.debug(`Querying ${userType} with lastSeen since: ${sinceTimestamp}`);
    const snapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${userType}`)
      .orderByChild('lastSeen')
      .startAt(sinceTimestamp)
      .once('value');
    return snapshot;
  }

  async getUsersBySource(userType, source) {
    logger.debug(`Querying ${userType} with stateSource: ${source}`);
    const snapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${userType}`)
      .orderByChild('stateSource')
      .equalTo(source)
      .once('value');
    return snapshot;
  }

  async getActiveUsers(userType) {
    return this.getUsersByState(userType, 'active');
  }

  async getOfflineUsers(userType) {
    return this.getUsersByState(userType, 'offline');
  }

  /**
   * Internal method for cleanup jobs - handles bulk user state updates
   * Uses scoped transaction to avoid conflicts with real-time updates
   */
  async updateUserStateInTransaction(userType, userId, state, source) {
    // Check if user exists first (cleanup jobs only update existing users)
    const userSnapshot = await db.ref(`activeUsers/${userType}/${userId}`).once('value');
    if (!userSnapshot.exists()) {
      logger.debug(`Cleanup: User ${userId} not found, skipping`);
      return;
    }
    
    // Use the same scoped transaction approach as real-time updates
    let transactionAttempt = 0;
    let previousState = null;
    
    await db.ref(`activeUsers/${userType}/${userId}`).transaction((userData) => {
      transactionAttempt++;
      
      // Capture the current state only from transaction attempts that have actual user data
      if (userData && previousState === null) {
        previousState = userData.state;
        logger.info(`Cleanup: Setting ${userId} from ${previousState || 'none'} to ${state} (attempt #${transactionAttempt})`);
      } else if (transactionAttempt === 1 && !userData) {
        logger.info(`Cleanup transaction attempt #1 has no data for ${userId} - will capture state from subsequent attempt with data`);
      }
      
      if (!userData) {
        // User was deleted between check and transaction
        return null;
      }
      
      // Update user state - preserve existing data  
      const updatedData = {
        ...userData,
        state: state,
        stateUpdatedAt: Date.now(),
        stateSource: source,
        lastSeen: Date.now()
      };
      
      return updatedData;
    });
    
    // Handle counter updates separately (same as real-time method)
    await this.updateCounterForStateChange(userType, userId, previousState, state, source);
  }
  async getActiveSessionsCount() {
    // Use counter for better performance instead of querying all participants
    const snapshot = await db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_PARTICIPANTS).once('value');
    return snapshot.val() || 0;
  }

  async hasActiveHostSession() {
    const countSnapshot = await db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS).once('value');
    const count = countSnapshot.val() || 0;
    return count > 0;
  }

  async endSession(hostId) {
    logger.info(`Ending session by host: ${hostId}`);
    
    // Set session ended flag
    await db.ref(FIREBASE_PATHS.SESSION_ENDED).set(true);
    
    // Clear all sessions and reset counters (both old and new paths for compatibility)
    await Promise.all([
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_HOSTS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS).set(0),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_PARTICIPANTS).set(0)
    ]);

    logger.info('Session ended successfully');
  }

  async checkSessionHealth() {
    const sessionEnded = await db.ref(FIREBASE_PATHS.SESSION_ENDED).once('value');
    return {
      ended: sessionEnded.val() === true,
      hasActiveHost: await this.hasActiveHostSession()
    };
  }

  async updateUserState(user, state, source) {
    const userType = user.role === 'host' ? 'hosts' : 'participants';
    const userId = user.role === 'host' ? user.uid : user.phone;
    
    logger.info(`Updating user state: ${userId} (${userType}) to '${state}' from '${source}'`);
    
    // Use most specific transaction scope - target exact user path to avoid conflicts
    let transactionAttempt = 0;
    let previousState = null;
    
    await db.ref(`activeUsers/${userType}/${userId}`).transaction((userData) => {
      transactionAttempt++;
      
      logger.info(`Transaction attempt #${transactionAttempt} for ${userId}: user data exists = ${!!userData}, data: ${JSON.stringify(userData || 'none')}`);
      
      // Capture the current state only from transaction attempts that have actual user data
      if (userData && previousState === null) {
        previousState = userData.state;
        logger.info(`Current state for user ${userId}: ${previousState || 'none'} from updateUserState (attempt #${transactionAttempt})`);
      } else if (transactionAttempt === 1 && !userData) {
        logger.info(`Transaction attempt #1 has no data for ${userId} - will capture state from subsequent attempt with data`);
      }
      
      // Update user state - preserve existing data
      const updatedData = {
        ...(userData || {}),
        state: state,
        stateUpdatedAt: Date.now(),
        stateSource: source,
        lastSeen: Date.now()
      };
      
      return updatedData;
    });
    
    // Handle counter updates separately to avoid transaction conflicts
    await this.updateCounterForStateChange(userType, userId, previousState, state, source);
  }

  async updateCounterForStateChange(userType, userId, currentState, newState, source) {
    // Counter represents connected users (regardless of tab visibility)
    // Connected states: active, background, closing
    // Disconnected state: offline
    
    const connectedStates = ['active', 'background', 'closing'];
    const wasConnected = currentState && connectedStates.includes(currentState);
    const isNowConnected = connectedStates.includes(newState);
    
    let counterChange = null;
    let changeReason = null;
    
    // Only modify counter for true connection/disconnection events
    if (!wasConnected && isNowConnected) {
      // User connecting: offline → connected state
      // Check source to ensure this is a legitimate connection
      const validConnectSources = ['login', 'connection', 'verifySession', 'visibility'];
      if (validConnectSources.includes(source)) {
        await db.ref(`activeUsers/counts/${userType}`).transaction((count) => {
          return (count || 0) + 1;
        });
        counterChange = '+1';
        changeReason = `${currentState || 'unknown'} → ${newState} via ${source}`;
        
        // Special logging for visibility-based increments (should be rare after offline cleanup)
        if (source === 'visibility' && (currentState === 'undefined' || !currentState)) {
          logger.info(`👁️ VISIBILITY INCREMENT: ${userType} counter +1 for user ${userId}: ${currentState || 'unknown'} → ${newState} (likely after cleanup)`);
        }
      } else {
        changeReason = `${currentState || 'unknown'} → ${newState} via ${source} (INVALID CONNECT SOURCE - NO INCREMENT)`;
        logger.warn(`❌ Invalid connect source '${source}' for user ${userId} - counter NOT incremented`);
      }
    } else if (wasConnected && !isNowConnected) {
      // User disconnecting: connected state → offline
      // Verify this is a legitimate disconnection source
      const validDisconnectSources = ['cleanup_job', 'beacon', 'disconnection', 'connection'];
      if (validDisconnectSources.includes(source)) {
        await db.ref(`activeUsers/counts/${userType}`).transaction((count) => {
          return Math.max(0, (count || 0) - 1);
        });
        counterChange = '-1';
        changeReason = `${currentState} → ${newState} via ${source}`;
        
        // Special logging for cleanup jobs to track their decrements
        if (source === 'cleanup_job') {
          logger.info(`🧹 CLEANUP DECREMENT: ${userType} counter -1 for user ${userId}: ${currentState} → ${newState}`);
        }
      } else {
        changeReason = `${currentState} → ${newState} via ${source} (INVALID DISCONNECT SOURCE - NO DECREMENT)`;
        logger.warn(`❌ Invalid disconnect source '${source}' for user ${userId} - counter NOT decremented`);
      }
    } else {
      // State change within connected states or no real change
      changeReason = `${currentState || 'unknown'} → ${newState} via ${source} (no counter change needed)`;
    }
    
    // Log counter changes for debugging
    if (counterChange) {
      const newCount = (await db.ref(`activeUsers/counts/${userType}`).once('value')).val() || 0;
      logger.info(`Counter changed ${counterChange} for ${userType}: ${changeReason}. New count: ${newCount}`);
    } else {
      logger.debug(`Counter unchanged for ${userType}: ${changeReason}`);
    }
  }

  /**
   * Update user state when you only have userId (used by beacon/disconnect monitoring)
   * Determines user type automatically and uses scoped transactions
   */
  async updateUserStateByUserId(userId, state, source) {
    logger.info(`Updating user state by ID: ${userId} to '${state}' from '${source}'`);
    
    // Try to find user in both hosts and participants
    const hostsSnapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS_HOSTS}/${userId}`).once('value');
    const participantsSnapshot = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS}/${userId}`).once('value');
    
    let userType = null;
    if (hostsSnapshot.exists()) {
      userType = 'hosts';
    } else if (participantsSnapshot.exists()) {
      userType = 'participants';
    } else {
      logger.warn(`User ${userId} not found in active users`);
      return;
    }
    
    // Use the same scoped transaction approach as other methods
    let transactionAttempt = 0;
    let previousState = null;
    
    await db.ref(`activeUsers/${userType}/${userId}`).transaction((userData) => {
      transactionAttempt++;
      
      // Capture the current state only from transaction attempts that have actual user data
      if (userData && previousState === null) {
        previousState = userData.state;
        logger.info(`Current state for user ${userId}: ${previousState || 'none'} from updateUserStateByUserId (attempt #${transactionAttempt})`);
      } else if (transactionAttempt === 1 && !userData) {
        logger.info(`updateUserStateByUserId transaction attempt #1 has no data for ${userId} - will capture state from subsequent attempt with data`);
      }
      
      if (!userData) {
        // User was deleted
        return null;
      }
      
      // Update user state - preserve existing data
      const updatedData = {
        ...userData,
        state: state,
        stateUpdatedAt: Date.now(),
        stateSource: source,
        lastSeen: Date.now()
      };
      
      return updatedData;
    });
    
    // Handle counter updates separately
    await this.updateCounterForStateChange(userType, userId, previousState, state, source);
  }

  startCleanupJobs() {
    logger.info('Starting session cleanup jobs');
    
    // Job 1: Cleanup 'closing' state users every 7 minutes
    setInterval(() => {
      this.cleanupClosingUsers();
    }, 3 * 60 * 1000);
    
    // Job 2: Cleanup 'background' participants every 35 minutes
    setInterval(() => {
      this.cleanupBackgroundParticipants();
    }, 35 * 60 * 1000);
    
  }

  async cleanupClosingUsers() {
    try {
      logger.info('Running closing users cleanup job');
      
      const userTypes = ['hosts', 'participants'];
      let totalCleaned = 0;
      
      for (const userType of userTypes) {
        // Use indexed query to get only 'closing' state users
        const snapshot = await this.getUsersByState(userType, 'closing');
        
        const now = Date.now();
        const fiveMinutes = 2 * 60 * 1000;
        
        snapshot.forEach(child => {
          const userId = child.key;
          const user = child.val();
          
          if (user) {
            const closingTime = now - user.stateUpdatedAt;
            if (closingTime >= fiveMinutes) {
              logger.info(`Cleaning up ${userType.slice(0, -1)} ${userId} (closing for ${Math.round(closingTime/60000)} minutes)`);
              
              // Update user state using transaction
              this.updateUserStateInTransaction(userType, userId, 'offline', 'cleanup_job');
              totalCleaned++;
            }
          }
        });
      }
      
      if (totalCleaned > 0) {
        logger.info(`Closing users cleanup completed: ${totalCleaned} users set offline`);
      }
    } catch (error) {
      logger.error('Error in closing users cleanup:', error);
    }
  }

  async cleanupBackgroundParticipants() {
    try {
      logger.info('Running background participants cleanup job');
      
      // Use indexed query to get only 'background' state participants
      const snapshot = await this.getUsersByState('participants', 'background');
      
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      let cleanedCount = 0;
      
      snapshot.forEach(child => {
        const userId = child.key;
        const user = child.val();
        
        if (user) {
          const backgroundTime = now - user.stateUpdatedAt;
          if (backgroundTime >= thirtyMinutes) {
            logger.info(`Cleaning up participant ${userId} (background for ${Math.round(backgroundTime/60000)} minutes)`);
            
            // Update user state using transaction
            this.updateUserStateInTransaction('participants', userId, 'offline', 'cleanup_job');
            cleanedCount++;
          }
        }
      });
      
      if (cleanedCount > 0) {
        logger.info(`Background participants cleanup completed: ${cleanedCount} participants set offline`);
      }
    } catch (error) {
      logger.error('Error in background participants cleanup:', error);
    }
  }


}

module.exports = new SessionService();