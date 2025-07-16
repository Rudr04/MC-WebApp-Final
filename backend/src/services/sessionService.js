const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class SessionService {
  async getActiveSessionsCount() {
    const snapshot = await db.ref('activeSessions').once('value');
    return snapshot.numChildren();
  }

  async hasActiveHostSession() {
    const hosts = await db.ref('activeHosts').once('value');
    const coHosts = await db.ref('activeCoHosts').once('value');
    return hosts.exists() || coHosts.exists();
  }

  async endSession(hostId) {
    logger.info(`Ending session by host: ${hostId}`);
    
    // Set session ended flag
    await db.ref('sessionEnded').set(true);
    
    // Clear all sessions
    await Promise.all([
      db.ref('activeSessions').remove(),
      db.ref('activeHosts').remove(),
      db.ref('activeCoHosts').remove()
    ]);

    logger.info('Session ended successfully');
  }

  async checkSessionHealth() {
    const sessionEnded = await db.ref('sessionEnded').once('value');
    return {
      ended: sessionEnded.val() === true,
      hasActiveHost: await this.hasActiveHostSession()
    };
  }
}

module.exports = new SessionService();