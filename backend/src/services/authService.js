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
      if (!current[FIREBASE_PATHS.ACTIVE_USERS]) current[FIREBASE_PATHS.ACTIVE_USERS] = {};
      if (!current[FIREBASE_PATHS.ACTIVE_USERS].hosts) current[FIREBASE_PATHS.ACTIVE_USERS].hosts = {};
      
      // Set host data with state tracking
      current[FIREBASE_PATHS.ACTIVE_USERS].hosts[user.uid] = {
        state: 'active',
        stateUpdatedAt: Date.now(),
        stateSource: 'login',
        lastSeen: Date.now()
      };
      
      // Set user data with heartbeat fields
      current[FIREBASE_PATHS.USERS][user.uid] = {
        ...user,
        timestamp: Date.now()
      };
      
      // Clear session ended flag
      current[FIREBASE_PATHS.SESSION_ENDED] = false;
      
      // Increment active host count atomically with host list update
      if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts) current[FIREBASE_PATHS.ACTIVE_USERS].counts = {};
      current[FIREBASE_PATHS.ACTIVE_USERS].counts.hosts = (current[FIREBASE_PATHS.ACTIVE_USERS].counts.hosts || 0) + 1;
      
      return current;
    });

    // Set up onDisconnect for host
    const hostRef = db.ref(`${FIREBASE_PATHS.ACTIVE_USERS_HOSTS}/${user.uid}`);
    await hostRef.onDisconnect().update({
      state: 'offline',
      stateUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      stateSource: 'connection'
    });
    
    // Set up counter decrement on disconnect
    const hostCounterRef = db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS);
    // Note: onDisconnect doesn't support transactions, we'll handle counter consistency via other means

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

    // Check if user is already in an active session (not offline)
    const userSession = await db.ref(`${FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS}/${phone}`).once('value');
    if (userSession.exists()) {
      const userData = userSession.val();
      // Allow login only if user is offline
      if (userData.state !== 'offline') {
        throw new Error(MESSAGES.ERROR.ALREADY_IN_SESSION);
      }
      logger.info(`User ${phone} was offline, allowing re-login`);
    }

    // Check if any host is active
    const hostCount = await db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_HOSTS).once('value');
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
      
      // Double-check session doesn't exist or is offline (race condition protection)
      const existingParticipant = current[FIREBASE_PATHS.ACTIVE_USERS] && current[FIREBASE_PATHS.ACTIVE_USERS].participants && current[FIREBASE_PATHS.ACTIVE_USERS].participants[phone];
      if (existingParticipant && existingParticipant.state !== 'offline') {
        throw new Error(MESSAGES.ERROR.ALREADY_IN_SESSION);
      }
      
      // Initialize paths if they don't exist
      if (!current[FIREBASE_PATHS.USERS]) current[FIREBASE_PATHS.USERS] = {};
      if (!current[FIREBASE_PATHS.ACTIVE_USERS]) current[FIREBASE_PATHS.ACTIVE_USERS] = {};
      if (!current[FIREBASE_PATHS.ACTIVE_USERS].participants) current[FIREBASE_PATHS.ACTIVE_USERS].participants = {};
      
      // Create participant session with state tracking
      current[FIREBASE_PATHS.ACTIVE_USERS].participants[phone] = {
        state: 'active',
        stateUpdatedAt: Date.now(),
        stateSource: 'login',
        lastSeen: Date.now()
      };
      
      // Create user data with heartbeat fields
      current[FIREBASE_PATHS.USERS][phone] = {
        ...user,
        timestamp: Date.now()
      };
      
      // Increment participant count atomically with session creation
      if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts) current[FIREBASE_PATHS.ACTIVE_USERS].counts = {};
      current[FIREBASE_PATHS.ACTIVE_USERS].counts.participants = (current[FIREBASE_PATHS.ACTIVE_USERS].counts.participants || 0) + 1;
      
      return current;
    });

    // Set up onDisconnect for participant
    const participantRef = db.ref(`${FIREBASE_PATHS.ACTIVE_USERS_PARTICIPANTS}/${phone}`);
    await participantRef.onDisconnect().update({
      state: 'offline',
      stateUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      stateSource: 'connection'
    });
    
    // Set up counter decrement on disconnect
    const participantCounterRef = db.ref(FIREBASE_PATHS.ACTIVE_USERS_COUNTS_PARTICIPANTS);
    // Note: onDisconnect doesn't support transactions, we'll handle counter consistency via other means

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

      // Update user state to active if not already active (handles tab restore)
      const userType = decoded.role === 'host' ? 'hosts' : 'participants';
      const userId = decoded.role === 'host' ? decoded.uid : decoded.phone;
      
      console.log(`verifySession: Starting state update for ${userType} ${userId}`);
      
      try {
        console.log(`verifySession: Attempting transaction for ${userType} ${userId}`);
        await db.ref().transaction((data) => {
          console.log(`verifySession: Transaction callback started for ${userType} ${userId}`);
          if (!data) data = {};
          
          // Initialize paths
          if (!data.activeUsers) data.activeUsers = {};
          if (!data.activeUsers[userType]) data.activeUsers[userType] = {};
          if (!data.activeUsers.counts) data.activeUsers.counts = {};
          if (!data.activeUsers.counts[userType]) data.activeUsers.counts[userType] = 0;
          
          const currentUser = data.activeUsers[userType][userId];
          const currentState = currentUser?.state;
          
          console.log(`verifySession: Found user ${userId}, currentState: ${currentState || 'undefined'}, exists: ${!!currentUser}`);
          
          // Apply proper counter logic for verifySession
          if (currentUser) {
            console.log(`verifySession: Processing existing user ${userId} with state ${currentState}`);
            // Always update user state to active - use clean structure
            data.activeUsers[userType][userId] = {
              state: 'active',
              stateUpdatedAt: Date.now(),
              stateSource: 'verifySession',
              lastSeen: Date.now()
            };
            
            // Only increment counter if coming from offline state
            const connectedStates = ['active', 'background', 'closing'];
            const wasConnected = currentState && connectedStates.includes(currentState);
            
            console.log(`verifySession: wasConnected = ${wasConnected}, connectedStates = [${connectedStates.join(', ')}]`);
            
            if (!wasConnected) {
              // User was offline, now connecting via verifySession
              const oldCount = data.activeUsers.counts[userType] || 0;
              data.activeUsers.counts[userType] = oldCount + 1;
              console.log(`verifySession: Counter changed +1 for ${userType}: ${currentState || 'unknown'} → active via verifySession. New count: ${data.activeUsers.counts[userType]}`);
            } else {
              // User was already connected (tab refresh, page reload, etc.)
              console.log(`verifySession: Counter unchanged for ${userType}: ${currentState} → active via verifySession (already connected)`);
            }
          } else {
            console.log(`verifySession: No currentUser found for ${userId}, skipping counter logic`);
          }
          
          return data;
        });
      } catch (error) {
        logger.warn('Could not update user state during verify:', error.message);
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
          if (current[FIREBASE_PATHS.ACTIVE_USERS] && current[FIREBASE_PATHS.ACTIVE_USERS].participants && current[FIREBASE_PATHS.ACTIVE_USERS].participants[decoded.phone]) {
            delete current[FIREBASE_PATHS.ACTIVE_USERS].participants[decoded.phone];
            
            // Decrement participant count atomically with session removal
            if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts) current[FIREBASE_PATHS.ACTIVE_USERS].counts = {};
            current[FIREBASE_PATHS.ACTIVE_USERS].counts.participants = Math.max(0, (current[FIREBASE_PATHS.ACTIVE_USERS].counts.participants || 0) - 1);
          }
          
          return current;
        });
      } else {
        // ATOMIC OPERATION: Remove host session and decrement counter together
        // This ensures host count matches actual active hosts
        await db.ref().transaction((current) => {
          if (current === null) current = {};
          
          // Remove host if it exists
          if (current[FIREBASE_PATHS.ACTIVE_USERS] && current[FIREBASE_PATHS.ACTIVE_USERS].hosts && current[FIREBASE_PATHS.ACTIVE_USERS].hosts[decoded.uid]) {
            delete current[FIREBASE_PATHS.ACTIVE_USERS].hosts[decoded.uid];
            
            // Decrement host count atomically with host removal
            if (!current[FIREBASE_PATHS.ACTIVE_USERS].counts) current[FIREBASE_PATHS.ACTIVE_USERS].counts = {};
            current[FIREBASE_PATHS.ACTIVE_USERS].counts.hosts = Math.max(0, (current[FIREBASE_PATHS.ACTIVE_USERS].counts.hosts || 0) - 1);
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