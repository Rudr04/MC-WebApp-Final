const { FIREBASE_PATHS } = require('../config/constants');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class SessionService {
  constructor() {
    // Start cleanup jobs
    this.startCleanupJobs();
  }
  async getActiveSessionsCount() {
    const snapshot = await db.ref(FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS).once('value');
    return snapshot.numChildren();
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
    
    await db.ref().transaction((data) => {
      if (!data) data = {};
      
      // Initialize paths
      if (!data.activeUsers) data.activeUsers = {};
      if (!data.activeUsers[userType]) data.activeUsers[userType] = {};
      if (!data.activeUsers.counts) data.activeUsers.counts = {};
      if (!data.activeUsers.counts[userType]) data.activeUsers.counts[userType] = 0;
      
      const currentUser = data.activeUsers[userType][userId];
      const currentState = currentUser?.state;
      
      // Update user state
      data.activeUsers[userType][userId] = {
        state: state,
        stateUpdatedAt: Date.now(),
        stateSource: source,
        lastSeen: Date.now()
      };
      
      // Counter represents connected users (regardless of tab visibility)
      // Connected states: active, background, closing
      // Disconnected state: offline
      
      const connectedStates = ['active', 'background', 'closing'];
      const wasConnected = currentState && connectedStates.includes(currentState);
      const isNowConnected = connectedStates.includes(state);
      
      let counterChange = null;
      let changeReason = null;
      
      // Only modify counter for true connection/disconnection events
      if (!wasConnected && isNowConnected) {
        // User connecting: offline → connected state
        // Check source to ensure this is a legitimate connection
        if (['login', 'connection', 'verifySession','visibility'].includes(source)) {
          data.activeUsers.counts[userType] = (data.activeUsers.counts[userType] || 0) + 1;
          counterChange = '+1';
          changeReason = `${currentState || 'unknown'} → ${state} via ${source}`;
        } else {
          changeReason = `${currentState || 'unknown'} → ${state} via ${source} (source not allowed for increment)`;
        }
      } else if (wasConnected && !isNowConnected) {
        // User disconnecting: connected state → offline
        data.activeUsers.counts[userType] = Math.max(0, (data.activeUsers.counts[userType] || 0) - 1);
        counterChange = '-1';
        changeReason = `${currentState} → ${state} via ${source}`;
      } else {
        // State change within connected states or no real change
        changeReason = `${currentState || 'unknown'} → ${state} via ${source} (no counter change needed)`;
      }
      
      // Log counter changes for debugging
      if (counterChange) {
        logger.info(`Counter changed ${counterChange} for ${userType}: ${changeReason}. New count: ${data.activeUsers.counts[userType]}`);
      } else {
        logger.debug(`Counter unchanged for ${userType}: ${changeReason}`);
      }
      
      return data;
    });
  }

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
    
    await db.ref().transaction((data) => {
      if (!data) data = {};
      
      // Initialize paths
      if (!data.activeUsers) data.activeUsers = {};
      if (!data.activeUsers[userType]) data.activeUsers[userType] = {};
      if (!data.activeUsers.counts) data.activeUsers.counts = {};
      if (!data.activeUsers.counts[userType]) data.activeUsers.counts[userType] = 0;
      
      const currentUser = data.activeUsers[userType][userId];
      const currentState = currentUser?.state;
      
      if (currentUser) {
        // Update user state
        data.activeUsers[userType][userId] = {
          state: state,
          stateUpdatedAt: Date.now(),
          stateSource: source,
          lastSeen: Date.now()
        };
        
        // Apply same counter logic as updateUserState method
        const connectedStates = ['active', 'background', 'closing'];
        const wasConnected = currentState && connectedStates.includes(currentState);
        const isNowConnected = connectedStates.includes(state);
        
        let counterChange = null;
        let changeReason = null;
        
        if (!wasConnected && isNowConnected) {
          // User connecting: offline → connected state
          if (['login', 'connection', 'verifySession'].includes(source)) {
            data.activeUsers.counts[userType] = (data.activeUsers.counts[userType] || 0) + 1;
            counterChange = '+1';
            changeReason = `${currentState || 'unknown'} → ${state} via ${source}`;
          } else {
            changeReason = `${currentState || 'unknown'} → ${state} via ${source} (source not allowed for increment)`;
          }
        } else if (wasConnected && !isNowConnected) {
          // User disconnecting: connected state → offline
          data.activeUsers.counts[userType] = Math.max(0, (data.activeUsers.counts[userType] || 0) - 1);
          counterChange = '-1';
          changeReason = `${currentState} → ${state} via ${source}`;
        } else {
          changeReason = `${currentState || 'unknown'} → ${state} via ${source} (no counter change needed)`;
        }
        
        // Log counter changes
        if (counterChange) {
          logger.info(`Counter changed ${counterChange} for ${userType}: ${changeReason}. New count: ${data.activeUsers.counts[userType]}`);
        } else {
          logger.debug(`Counter unchanged for ${userType}: ${changeReason}`);
        }
      }
      
      return data;
    });
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
        const usersRef = db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${userType}`);
        const snapshot = await usersRef.once('value');
        const users = snapshot.val() || {};
        
        const now = Date.now();
        const fiveMinutes = 2 * 60 * 1000;
        
        for (const userId in users) {
          const user = users[userId];
          if (user && user.state === 'closing') {
            const closingTime = now - user.stateUpdatedAt;
            if (closingTime >= fiveMinutes) {
              logger.info(`Cleaning up ${userType.slice(0, -1)} ${userId} (closing for ${Math.round(closingTime/60000)} minutes)`);
              
              await db.ref().transaction((data) => {
                if (!data) data = {};
                
                // Initialize paths
                if (!data.activeUsers) data.activeUsers = {};
                if (!data.activeUsers[userType]) data.activeUsers[userType] = {};
                if (!data.activeUsers.counts) data.activeUsers.counts = {};
                if (!data.activeUsers.counts[userType]) data.activeUsers.counts[userType] = 0;
                
                const currentUser = data.activeUsers[userType][userId];
                const currentState = currentUser?.state;
                
                if (currentUser && currentState === 'closing') {
                  // Update user state to offline
                  data.activeUsers[userType][userId] = {
                    state: 'offline',
                    stateUpdatedAt: Date.now(),
                    stateSource: 'cleanup_job',
                    lastSeen: Date.now()
                  };
                  
                  // Decrement counter (cleanup job always moves from connected state to offline)
                  const connectedStates = ['active', 'background', 'closing'];
                  if (connectedStates.includes(currentState)) {
                    const oldCount = data.activeUsers.counts[userType] || 0;
                    data.activeUsers.counts[userType] = Math.max(0, oldCount - 1);
                    logger.info(`Counter changed -1 for ${userType}: ${currentState} → offline via cleanup_job. New count: ${data.activeUsers.counts[userType]}`);
                  }
                }
                
                return data;
              });
              
              totalCleaned++;
            }
          }
        }
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
      
      const participantsRef = db.ref(FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS);
      const snapshot = await participantsRef.once('value');
      const participants = snapshot.val() || {};
      
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      let cleanedCount = 0;
      
      for (const userId in participants) {
        const user = participants[userId];
        if (user && user.state === 'background') {
          const backgroundTime = now - user.stateUpdatedAt;
          if (backgroundTime >= thirtyMinutes) {
            logger.info(`Cleaning up participant ${userId} (background for ${Math.round(backgroundTime/60000)} minutes)`);
            
            await db.ref().transaction((data) => {
              if (!data) data = {};
              
              // Initialize paths
              if (!data.activeUsers) data.activeUsers = {};
              if (!data.activeUsers.participants) data.activeUsers.participants = {};
              if (!data.activeUsers.counts) data.activeUsers.counts = {};
              if (!data.activeUsers.counts.participants) data.activeUsers.counts.participants = 0;
              
              const currentUser = data.activeUsers.participants[userId];
              const currentState = currentUser?.state;
              
              if (currentUser && currentState === 'background') {
                // Update user state to offline
                data.activeUsers.participants[userId] = {
                  state: 'offline',
                  stateUpdatedAt: Date.now(),
                  stateSource: 'cleanup_job',
                  lastSeen: Date.now()
                };
                
                // Decrement counter (background → offline)
                const connectedStates = ['active', 'background', 'closing'];
                if (connectedStates.includes(currentState)) {
                  const oldCount = data.activeUsers.counts.participants || 0;
                  data.activeUsers.counts.participants = Math.max(0, oldCount - 1);
                  logger.info(`Counter changed -1 for participants: ${currentState} → offline via cleanup_job. New count: ${data.activeUsers.counts.participants}`);
                }
              }
              
              return data;
            });
            
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Background participants cleanup completed: ${cleanedCount} participants set offline`);
      }
    } catch (error) {
      logger.error('Error in background participants cleanup:', error);
    }
  }


}

module.exports = new SessionService();