const jwt = require('jsonwebtoken');
const { auth } = require('../config/firebase');
const config = require('../config/config');
const { logger } = require('../utils/logger');
const { MESSAGES, HTTP_STATUS, ROLES } = require('../config/constants');

/**
 * Verify JWT token and attach user to request
 */
const verifyToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: MESSAGES.ERROR.NO_TOKEN 
      });
    }
    
    // Expected format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: MESSAGES.ERROR.INVALID_TOKEN 
      });
    }
    
    const token = parts[1];
    
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Check if token has required fields
    if (!decoded.uid || !decoded.role) {
      throw new Error('Invalid token structure');
    }
    
    // Attach user info to request
    req.user = decoded;
    
    // Log successful authentication
    logger.debug(`Token verified for user: ${decoded.uid} (${decoded.role})`);
    
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: MESSAGES.ERROR.INVALID_TOKEN,
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: MESSAGES.ERROR.UNAUTHORIZED 
    });
  }
};

/**
 * Verify user has host or co-host role
 */
const verifyHost = (req, res, next) => {
  if (!req.user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: MESSAGES.ERROR.UNAUTHORIZED 
    });
  }
  
  if (req.user.role !== ROLES.HOST && req.user.role !== ROLES.CO_HOST) {
    logger.warn(`Access denied for non-host user: ${req.user.uid}`);
    return res.status(HTTP_STATUS.FORBIDDEN).json({ 
      error: MESSAGES.ERROR.HOST_ONLY 
    });
  }
  
  next();
};

/**
 * Verify user has specific role
 */
const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: MESSAGES.ERROR.UNAUTHORIZED 
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.uid} with role ${req.user.role}`);
      return res.status(HTTP_STATUS.FORBIDDEN).json({ 
        error: MESSAGES.ERROR.ACCESS_DENIED,
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Verify Firebase ID token (for Google OAuth)
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: 'No Firebase token provided' 
      });
    }
    
    const idToken = authHeader.split(' ')[1];
    
    if (!idToken) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: 'Invalid Firebase token format' 
      });
    }
    
    // Verify the ID token with Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Attach Firebase user info to request
    req.firebaseUser = decodedToken;
    
    logger.debug(`Firebase token verified for user: ${decodedToken.uid}`);
    
    next();
  } catch (error) {
    logger.error('Firebase token verification error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: 'Firebase token has expired',
        code: 'FIREBASE_TOKEN_EXPIRED'
      });
    }
    
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-revoked') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: 'Invalid Firebase token',
        code: 'INVALID_FIREBASE_TOKEN'
      });
    }
    
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: 'Firebase authentication failed' 
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return next();
  }
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
  } catch (error) {
    // Don't fail, just continue without user
    logger.debug('Optional auth: Invalid token provided');
  }
  
  next();
};

/**
 * Verify user owns the resource or is a host
 */
const verifyOwnershipOrHost = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: MESSAGES.ERROR.UNAUTHORIZED 
      });
    }
    
    // Hosts and co-hosts can access any resource
    if (req.user.role === ROLES.HOST || req.user.role === ROLES.CO_HOST) {
      return next();
    }
    
    // Check if user owns the resource
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (req.user.uid !== resourceUserId && req.user.phone !== resourceUserId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ 
        error: MESSAGES.ERROR.ACCESS_DENIED,
        message: 'You can only access your own resources'
      });
    }
    
    next();
  };
};

/**
 * Refresh token if it's about to expire (within 1 hour)
 */
const refreshTokenIfNeeded = (req, res, next) => {
  if (!req.user) {
    return next();
  }
  
  try {
    // Check token expiration
    const tokenExp = req.user.exp;
    const now = Math.floor(Date.now() / 1000);
    const oneHour = 60 * 60;
    
    // If token expires within 1 hour, issue a new one
    if (tokenExp - now < oneHour) {
      const newToken = jwt.sign(
        {
          uid: req.user.uid,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role,
          phone: req.user.phone
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiry }
      );
      
      // Add new token to response header
      res.setHeader('X-New-Token', newToken);
      logger.debug(`Refreshed token for user: ${req.user.uid}`);
    }
  } catch (error) {
    logger.error('Token refresh error:', error);
  }
  
  next();
};

module.exports = {
  verifyToken,
  verifyHost,
  verifyRole,
  verifyFirebaseToken,
  optionalAuth,
  verifyOwnershipOrHost,
  refreshTokenIfNeeded
};