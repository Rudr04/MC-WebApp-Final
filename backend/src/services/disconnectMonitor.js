const { FIREBASE_PATHS, ROLES } = require('../config/constants');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class DisconnectMonitor {
  constructor() {
    this.processedUsers = new Set();
    this.hostsRef = null;
    this.participantsRef = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('DisconnectMonitor is already running');
      return;
    }

    logger.info('Starting DisconnectMonitor service');
    
    // Listen to both hosts and participants paths
    this.hostsRef = db.ref(FIREBASE_PATHS.ACTIVE_USERS_HOSTS);
    this.participantsRef = db.ref(FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS);
    
    // Set up listeners for hosts
    this.hostsRef.on('child_changed', (snapshot) => {
      const userId = snapshot.key;
      const userData = snapshot.val();
      
      // Check if user went offline due to connection loss
      if (userData && 
          userData.state === 'offline' && 
          userData.stateSource === 'connection' &&
          !this.processedUsers.has(userId)) {
        
        logger.info(`Detected host disconnect for user: ${userId}`);
        this.handleDisconnect(userId, userData, 'hosts');
      }
    });

    // Set up listeners for participants
    this.participantsRef.on('child_changed', (snapshot) => {
      const userId = snapshot.key;
      const userData = snapshot.val();
      
      // Check if user went offline due to connection loss
      if (userData && 
          userData.state === 'offline' && 
          userData.stateSource === 'connection' &&
          !this.processedUsers.has(userId)) {
        
        logger.info(`Detected participant disconnect for user: ${userId}`);
        this.handleDisconnect(userId, userData, 'participants');
      }
    });

    this.isRunning = true;
    logger.info('DisconnectMonitor service started successfully');
  }

  async handleDisconnect(userId, userData, userType) {
    // Add to processed set to prevent duplicate processing
    this.processedUsers.add(userId);
    
    try {
      logger.info(`Processing disconnect for user: ${userId} (${userType})`);

      // For hosts, userId is the uid; for participants, userId is the phone
      const userKey = userId;

      await db.ref().transaction((current) => {
        if (current === null) current = {};

        // Initialize paths if they don't exist
        if (!current[FIREBASE_PATHS.ACTIVE_USERS]) current[FIREBASE_PATHS.ACTIVE_USERS] = {};
        if (!current[FIREBASE_PATHS.ACTIVE_USERS][userType]) current[FIREBASE_PATHS.ACTIVE_USERS][userType] = {};
        if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts) current[FIREBASE_PATHS.ACTIVE_USERS].counts = {};
        if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts[userType]) current[FIREBASE_PATHS.ACTIVE_USERS].counts[userType] = 0;

        // Check if user is still offline in activeUsers (they might have reconnected)
        const currentUserData = current[FIREBASE_PATHS.ACTIVE_USERS] && 
                               current[FIREBASE_PATHS.ACTIVE_USERS][userType] && 
                               current[FIREBASE_PATHS.ACTIVE_USERS][userType][userKey];
        if (!currentUserData || 
            currentUserData.state !== 'offline' || 
            currentUserData.stateSource !== 'connection') {
          logger.info(`User ${userId} reconnected before processing disconnect, skipping`);
          return current;
        }

        // activeUser is the same as currentUserData, already checked above
        const activeUser = currentUserData;

        // Check if user was in a connected state before going offline
        const connectedStates = ['active', 'background', 'closing'];
        // Since we're processing a state change to offline, we need to check if they were previously connected
        // The fact that onDisconnect triggered means they were connected

        // Remove user from active users and decrement counter
        const oldCount = current[FIREBASE_PATHS.ACTIVE_USERS].counts[userType] || 0;
        current[FIREBASE_PATHS.ACTIVE_USERS].counts[userType] = Math.max(0, oldCount - 1);

        logger.info(`Disconnect processed: ${userId} removed from active${userType}, count: ${oldCount} → ${current[FIREBASE_PATHS.ACTIVE_USERS].counts[userType]}`);

        return current;
      });

    } catch (error) {
      logger.error(`Error processing disconnect for user ${userId}:`, error);
    } finally {
      // Clean up processed users set after 5 seconds
      setTimeout(() => {
        this.processedUsers.delete(userId);
        logger.debug(`Removed ${userId} from processed users set`);
      }, 5000);
    }
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('DisconnectMonitor is not running');
      return;
    }

    logger.info('Stopping DisconnectMonitor service');
    
    if (this.hostsRef) {
      this.hostsRef.off('child_changed');
      this.hostsRef = null;
    }

    if (this.participantsRef) {
      this.participantsRef.off('child_changed');
      this.participantsRef = null;
    }

    this.processedUsers.clear();
    this.isRunning = false;
    
    logger.info('DisconnectMonitor service stopped');
  }

  // Method to check service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      processedUsersCount: this.processedUsers.size,
      processedUsers: Array.from(this.processedUsers)
    };
  }
}

module.exports = new DisconnectMonitor();