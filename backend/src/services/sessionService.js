const { FIREBASE_PATHS } = require('../config/constants');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class SessionService {
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
    
    // Clear all sessions
    await Promise.all([
      db.ref(FIREBASE_PATHS.ACTIVE_SESSIONS).remove(),
      db.ref(FIREBASE_PATHS.ACTIVE_HOSTS).remove(),
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
}

module.exports = new SessionService();