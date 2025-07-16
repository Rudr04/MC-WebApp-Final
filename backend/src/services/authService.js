const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');
const config = require('../config/config');
const { logger } = require('../utils/logger');
const { FIREBASE_PATHS, MESSAGES, ROLES } = require('../config/constants');

class AuthService {
  async authenticateHost(firebaseUser) {
    const email = firebaseUser.email.toLowerCase();
    const role = config.allowedHosts[email];
    
    if (!role) {
      throw new Error(MESSAGES.ERROR.ACCESS_DENIED);
    }

    const user = {
      uid: firebaseUser.uid,
      email: email,
      name: firebaseUser.name || email,
      role: role
    };

    // Create session in database
    await db.ref(`${FIREBASE_PATHS.ACTIVE_HOSTS}/${user.uid}`).set({
      ...user,
      timestamp: Date.now()
    });

    // Clear session ended flag
    await db.ref(FIREBASE_PATHS.SESSION_ENDED).set(false);

    // Generate JWT
    const token = jwt.sign(user, config.jwt.secret, {
      expiresIn: config.jwt.expiry
    });

    logger.info(`Host logged in: ${email}`);
    
    return { token, user };
  }

  async authenticateParticipant(name, phone) {
    // Check whitelist
    const whitelisted = await db.ref(`${FIREBASE_PATHS.WHITELIST}/${phone}`).once('value');
    if (!whitelisted.exists()) {
      throw new Error(MESSAGES.ERROR.NOT_WHITELISTED);
    }

    // Check if already in session
    const activeSession = await db.ref(`${FIREBASE_PATHS.ACTIVE_SESSIONS}/${phone}`).once('value');
    if (activeSession.exists()) {
      throw new Error(MESSAGES.ERROR.ALREADY_IN_SESSION);
    }

    // Check if host session exists
    const hasActiveHost = await this.checkActiveHosts();
    if (!hasActiveHost) {
      throw new Error(MESSAGES.ERROR.NO_ACTIVE_SESSION);
    }

    const user = {
      phone: phone,
      name: name,
      role: ROLES.PARTICIPANT,
      uid: phone // Using phone as UID for participants
    };

    // Create session
    await db.ref(`${FIREBASE_PATHS.ACTIVE_SESSIONS}/${phone}`).set(true);
    await db.ref(`${FIREBASE_PATHS.USERS}/${phone}`).set({
      ...user,
      timestamp: Date.now()
    });

    // Generate JWT
    const token = jwt.sign(user, config.jwt.secret, {
      expiresIn: config.jwt.expiry
    });

    logger.info(`Participant joined: ${name} (${phone})`);

    return { token, user };
  }

  async checkActiveHosts() {
    const hosts = await db.ref(FIREBASE_PATHS.ACTIVE_HOSTS).once('value');
    const coHosts = await db.ref(FIREBASE_PATHS.ACTIVE_CO_HOSTS).once('value');
    return hosts.exists() || coHosts.exists();
  }

  async verifySession(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      return { valid: true, user: decoded };
    } catch (error) {
      return { valid: false };
    }
  }

  async logout(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      
      if (decoded.role === ROLES.PARTICIPANT) {
        await db.ref(`${FIREBASE_PATHS.ACTIVE_SESSIONS}/${decoded.phone}`).remove();
      } else {
        await db.ref(`${FIREBASE_PATHS.ACTIVE_HOSTS}/${decoded.uid}`).remove();
      }

      logger.info(`User logged out: ${decoded.name}`);
    } catch (error) {
      logger.error('Logout error:', error);
    }
  }
}

module.exports = new AuthService();