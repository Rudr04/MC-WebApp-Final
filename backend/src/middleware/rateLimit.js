const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// Create different rate limiters for different endpoints
const createRateLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100, // limit each IP to 100 requests per windowMs
    message: options.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        error: options.message || 'Too many requests, please try again later.'
      });
    }
  });
};

// Specific rate limiters for different operations
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.'
});

const participantJoinLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 3 join attempts per 5 minutes
  message: 'Too many join attempts, please wait a few minutes.'
});

const messageLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 messages per minute
  message: 'Too many Messages are sent too quickly, please slow down.'
});

const generalApiLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100
});

// Per-user rate limiting for authenticated requests
const perUserRateLimiter = (maxRequests = 100, windowMinutes = 15) => {
  const userLimiters = new Map();
  
  return (req, res, next) => {
    if (!req.user || !req.user.uid) {
      return next();
    }
    
    const userId = req.user.uid;
    
    if (!userLimiters.has(userId)) {
      userLimiters.set(userId, createRateLimiter({
        windowMs: windowMinutes * 60 * 1000,
        max: maxRequests,
        keyGenerator: () => userId,
        message: `User rate limit exceeded. Maximum ${maxRequests} requests per ${windowMinutes} minutes.`
      }));
    }
    
    const limiter = userLimiters.get(userId);
    limiter(req, res, next);
  };
};

module.exports = {
  authLimiter,
  participantJoinLimiter,
  messageLimiter,
  generalApiLimiter,
  perUserRateLimiter,
  createRateLimiter
};