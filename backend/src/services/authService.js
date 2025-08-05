const jwt = require('jsonwebtoken');
const { admin, db } = require('../config/firebase');
const config = require('../config/config');
const { logger } = require('../utils/logger');
const { FIREBASE_PATHS, MESSAGES, ROLES } = require('../config/constants');

class AuthService {

  async generateFirebaseToken(uid, claims = {}) {
    try {
      const customToken = await admin.auth().createCustomToken(uid, {
        role: claims.role,
        email: claims.email,
        phone: claims.phone,
        name: claims.name
      });
      
      logger.info(`Firebase custom token generated for uid: ${uid}`);
      return customToken;
    } catch (error) {
      logger.error('Firebase custom token generation error:', error);
      return null;
    }
  }

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

    // ATOMIC OPERATION: All host session data must be updated together
    // This ensures counter and host list stay in sync
    await db.ref().transaction((current) => {
      if (current === null) current = {};
      
      // Initialize paths if they don't exist
      if (!current[FIREBASE_PATHS.ACTIVE_HOSTS]) current[FIREBASE_PATHS.ACTIVE_HOSTS] = {};
      if (!current[FIREBASE_PATHS.USERS]) current[FIREBASE_PATHS.USERS] = {};
      
      // Set host data
      current[FIREBASE_PATHS.ACTIVE_HOSTS][user.uid] = {
        ...user,
        timestamp: Date.now()
      };
      
      // Set user data with heartbeat fields
      current[FIREBASE_PATHS.USERS][user.uid] = {
        ...user,
        timestamp: Date.now(),
        lastHeartbeat: Date.now(),
        userState: 'active'
      };
      
      // Clear session ended flag
      current[FIREBASE_PATHS.SESSION_ENDED] = false;
      
      // Increment active host count atomically with host list update
      current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] = (current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] || 0) + 1;
      
      return current;
    });

    // PARALLEL OPERATION: JWT and Firebase token generation are independent
    // These can be done simultaneously to improve performance
    const [token, firebaseToken] = await Promise.all([
      // JWT token generation (synchronous but wrapped for consistency)
      Promise.resolve(jwt.sign(user, config.jwt.secret, {
        expiresIn: config.jwt.expiry
      })),
      // Firebase token generation (asynchronous)
      this.generateFirebaseToken(user.uid, user)
    ]);

    logger.info(`Host logged in: ${email}`);
    
    return { firebaseToken, token, user };
  }

  async authenticateParticipant(phone) {
    // Check whitelist and get user data
    const whitelistEntry = await db.ref(`${FIREBASE_PATHS.WHITELIST}/${phone}`).once('value');
    if (!whitelistEntry.exists()) {
      throw new Error(MESSAGES.ERROR.NOT_WHITELISTED);
    }

    // Handle both old format (phone: true) and new format (phone: {name: "...", source: "..."})
    const whitelistData = whitelistEntry.val();
    let name;
    
    if (typeof whitelistData === 'boolean' && whitelistData === true) {
      // Old format - backward compatibility
      throw new Error('Name not found in whitelist. Please contact administrator.');
    } else if (typeof whitelistData === 'object' && whitelistData.name) {
      // New format - extract name
      name = whitelistData.name;
    } else {
      // Invalid format
      throw new Error('Invalid whitelist entry format. Please contact administrator.');
    }

    // Validate extracted name
    if (!name || name.trim().length === 0) {
      throw new Error('Name not found in whitelist. Please contact administrator.');
    }

    // Check if already in session
    const activeSession = await db.ref(`${FIREBASE_PATHS.ACTIVE_SESSIONS}/${phone}`).once('value');
    if (activeSession.exists()) {
      throw new Error(MESSAGES.ERROR.ALREADY_IN_SESSION);
    }

    // Check if any host is active
    const hostCount = await db.ref('activeHostCount').once('value');
    if (!hostCount.exists() || hostCount.val() <= 0) {
      throw new Error(MESSAGES.ERROR.NO_ACTIVE_SESSION);
    }

    const user = {
      phone: phone,
      name: name.trim(),
      role: ROLES.PARTICIPANT,
      uid: phone // Using phone as UID for participants
    };

    // ATOMIC OPERATION: Participant session and counter must be updated together
    // This ensures participant count matches actual active sessions
    await db.ref().transaction((current) => {
      if (current === null) current = {};
      
      // Double-check session doesn't exist (race condition protection)
      if (current[FIREBASE_PATHS.ACTIVE_SESSIONS] && current[FIREBASE_PATHS.ACTIVE_SESSIONS][phone]) {
        throw new Error(MESSAGES.ERROR.ALREADY_IN_SESSION);
      }
      
      // Initialize paths if they don't exist
      if (!current[FIREBASE_PATHS.ACTIVE_SESSIONS]) current[FIREBASE_PATHS.ACTIVE_SESSIONS] = {};
      if (!current[FIREBASE_PATHS.USERS]) current[FIREBASE_PATHS.USERS] = {};
      
      // Create session
      current[FIREBASE_PATHS.ACTIVE_SESSIONS][phone] = true;
      
      // Create user data with heartbeat fields
      current[FIREBASE_PATHS.USERS][phone] = {
        ...user,
        timestamp: Date.now(),
        lastHeartbeat: Date.now(),
        userState: 'active'
      };
      
      // Increment participant count atomically with session creation
      current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] = (current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] || 0) + 1;
      
      return current;
    });

    const sanitizedPhone = phone.replace(/[^0-9]/g, '');
    const participantUid = `participant_${sanitizedPhone}`; //sanitize before passing for token generation firebase

    // PARALLEL OPERATION: JWT and Firebase token generation are independent
    // These can be done simultaneously to improve performance
    const [token, firebaseToken] = await Promise.all([
      // JWT token generation (synchronous but wrapped for consistency)
      Promise.resolve(jwt.sign(user, config.jwt.secret, {
        expiresIn: config.jwt.expiry
      })),
      // Firebase token generation (asynchronous)
      this.generateFirebaseToken(participantUid, {
        ...user,
        uid: participantUid
      })
    ]);

    logger.info(`Participant joined: ${name} (${phone}) - Name from whitelist`);

    return { firebaseToken, token, user };
  }

  async verifySession(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      let firebaseToken = null;
      try {
        firebaseToken = await this.generateFirebaseToken(decoded.uid, decoded);
      } catch (error) {
        logger.warn('Could not generate Firebase token during verify:', error.message);
      }

      return {
        valid: true, 
        user: decoded,
        firebaseToken
       };
    } catch (error) {
      return { valid: false };
    }
  }

  async logout(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      
      if (decoded.role === ROLES.PARTICIPANT) {
        // ATOMIC OPERATION: Remove participant session and decrement counter together
        // This ensures participant count matches actual active sessions
        await db.ref().transaction((current) => {
          if (current === null) current = {};
          
          // Remove session if it exists
          if (current[FIREBASE_PATHS.ACTIVE_SESSIONS] && current[FIREBASE_PATHS.ACTIVE_SESSIONS][decoded.phone]) {
            delete current[FIREBASE_PATHS.ACTIVE_SESSIONS][decoded.phone];
            
            // Decrement participant count atomically with session removal
            current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] = Math.max(0, (current[FIREBASE_PATHS.ACTIVE_PARTICIPANT_COUNT] || 0) - 1);
          }
          
          return current;
        });
      } else {
        // ATOMIC OPERATION: Remove host session and decrement counter together
        // This ensures host count matches actual active hosts
        await db.ref().transaction((current) => {
          if (current === null) current = {};
          
          // Remove host if it exists
          if (current[FIREBASE_PATHS.ACTIVE_HOSTS] && current[FIREBASE_PATHS.ACTIVE_HOSTS][decoded.uid]) {
            delete current[FIREBASE_PATHS.ACTIVE_HOSTS][decoded.uid];
            
            // Decrement host count atomically with host removal
            current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] = Math.max(0, (current[FIREBASE_PATHS.ACTIVE_HOST_COUNT] || 0) - 1);
          }
          
          return current;
        });
      }

      logger.info(`User logged out: ${decoded.name}`);

    } catch (error) {
      logger.error('Logout error:', error);
    }
  }
}

module.exports = new AuthService();