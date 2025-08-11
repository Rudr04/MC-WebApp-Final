const { FIREBASE_PATHS } = require('../config/constants');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class SessionService {
  constructor() {
    // Start cleanup jobs
    this.startCleanupJobs();
  }
  async getActiveSessionsCount() {
    const snapshot = await db.ref(FIREBASE_PATHS.ACTIVE_SESSIONS).once('value');
    return snapshot.numChildren();
  }

  async hasActiveHostSession() {
    const countSnapshot = await db.ref(FIREBASE_PATHS.ACTIVE_HOST_COUNT).once('value');
    const count = countSnapshot.val() || 0;
    return count > 0;
  }

  async endSession(hostId) {
    logger.info(`Ending session by host: ${hostId}`);
    
    // Set session ended flag
    await db.ref(FIREBASE_PATHS.SESSION_ENDED).set(true);
    
<<<<<<< Updated upstream
    // Clear all sessions and reset counters
    await Promise.all([
      db.ref(FIREBASE_PATHS.ACTIVE_SESSIONS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_HOSTS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT).set(0),
      db.ref(FIREBASE_PATHS.ACTIVE_HOST_COUNT).set(0)
=======
    // Clear all sessions and reset counters (both old and new paths for compatibility)
    await Promise.all([
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_HOSTS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS).set(0),
      db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_PARTICIPANTS).set(0)
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======

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
        ...currentUser,
        state: state,
        stateUpdatedAt: Date.now(),
        stateSource: source,
        lastSeen: Date.now()
      };
      
      // Update counter based on transitions
      if (state === 'active' && currentState !== 'active') {
        data.activeUsers.counts[userType] = (data.activeUsers.counts[userType] || 0) + 1;
      } else if (state === 'offline' && currentState !== 'offline') {
        data.activeUsers.counts[userType] = Math.max(0, (data.activeUsers.counts[userType] || 0) - 1);
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
          ...currentUser,
          state: state,
          stateUpdatedAt: Date.now(),
          stateSource: source,
          lastSeen: Date.now()
        };
        
        // Update counter based on transitions
        if (state === 'active' && currentState !== 'active') {
          data.activeUsers.counts[userType] = (data.activeUsers.counts[userType] || 0) + 1;
        } else if (state === 'offline' && currentState !== 'offline') {
          data.activeUsers.counts[userType] = Math.max(0, (data.activeUsers.counts[userType] || 0) - 1);
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
    }, 7 * 60 * 1000);
    
    // Job 2: Cleanup 'background' participants every 35 minutes
    setInterval(() => {
      this.cleanupBackgroundParticipants();
    }, 35 * 60 * 1000);
    
    // Job 3: Synchronize counters every 5 minutes (handles onDisconnect counter sync)
    setInterval(() => {
      this.synchronizeCounters();
    }, 5 * 60 * 1000);
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
        const fiveMinutes = 5 * 60 * 1000;
        
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
                    ...currentUser,
                    state: 'offline',
                    stateUpdatedAt: Date.now(),
                    stateSource: 'cleanup_job',
                    lastSeen: Date.now()
                  };
                  
                  // Decrement counter if not already offline
                  if (currentState !== 'offline') {
                    data.activeUsers.counts[userType] = Math.max(0, (data.activeUsers.counts[userType] || 0) - 1);
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
                  ...currentUser,
                  state: 'offline',
                  stateUpdatedAt: Date.now(),
                  stateSource: 'cleanup_job',
                  lastSeen: Date.now()
                };
                
                // Decrement counter if not already offline
                if (currentState !== 'offline') {
                  data.activeUsers.counts.participants = Math.max(0, (data.activeUsers.counts.participants || 0) - 1);
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

  async synchronizeCounters() {
    try {
      logger.info('Running counter synchronization job');
      
      const userTypes = [
        { type: 'hosts', counterPath: FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS },
        { type: 'participants', counterPath: FIREBASE_PATHS.ACTIVE_USERS_COUNTS_PARTICIPANTS }
      ];
      
      for (const { type, counterPath } of userTypes) {
        const usersRef = db.ref(`${FIREBASE_PATHS.ACTIVE_USERS}/${type}`);
        const snapshot = await usersRef.once('value');
        const users = snapshot.val() || {};
        
        // Count actual active users
        let actualActiveCount = 0;
        for (const userId in users) {
          const user = users[userId];
          if (user && user.state === 'active') {
            actualActiveCount++;
          }
        }
        
        // Get current counter value
        const counterRef = db.ref(counterPath);
        const counterSnapshot = await counterRef.once('value');
        const currentCount = counterSnapshot.val() || 0;
        
        // Update counter if it doesn't match
        if (actualActiveCount !== currentCount) {
          logger.info(`Counter sync for ${type}: ${currentCount} -> ${actualActiveCount}`);
          await counterRef.set(actualActiveCount);
        }
      }
      
    } catch (error) {
      logger.error('Error in counter synchronization:', error);
    }
  }

>>>>>>> Stashed changes
}

module.exports = new SessionService();