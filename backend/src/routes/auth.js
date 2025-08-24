const express = require('express');
const authService = require('../services/authService');
const { verifyFirebaseToken, verifyToken } = require('../middleware/auth');
const { validateParticipantLogin } = require('../utils/validator');
const { authLimiter, participantJoinLimiter } = require('../middleware/rateLimit');
const { MESSAGES, HTTP_STATUS, ROLES } = require('../config/constants');

const router = express.Router();

// Host login with rate limiting
router.post('/host/login',
  verifyFirebaseToken,
  async (req, res, next) => {
  try {
    const result = await authService.authenticateHost(req.firebaseUser);
    res.json({
      ...result,
      message: MESSAGES.SUCCESS.LOGIN
    });
  } catch (error) {
    next(error);
  }
});

// Participant login with validation and rate limiting
router.post('/participant/login', 
  validateParticipantLogin, 
  async (req, res, next) => {
    try {
      const { phone } = req.body;
      const result = await authService.authenticateParticipant(phone);
      res.json({
        ...result,
        message: MESSAGES.SUCCESS.LOGIN
      });
    } catch (error) {
      next(error);
    }
});

// Verify session
router.get('/verify', verifyToken, async (req, res, next) => {
  try {
    const result = await authService.verifySession(req.headers.authorization?.split(' ')[1]);
    
    // Generate UI permissions based on user role
    const uiPermissions = {
      canEndSession: req.user.role === ROLES.HOST,
      canSelectRecipients: req.user.role === ROLES.HOST || req.user.role === ROLES.CO_HOST,
      canViewParticipants: req.user.role === ROLES.HOST || req.user.role === ROLES.CO_HOST
    };
    
    res.json({
      ...result,
      user: req.user,
      uiPermissions
    });
  } catch (error) {
    next(error);
  }
});

// Refresh Firebase token
router.get('/refresh-token', verifyToken, async (req, res, next) => {
  try {
    const firebaseToken = await authService.generateFirebaseToken(req.user.uid, req.user);
    res.json({ 
      firebaseToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    await authService.logout(token);
    res.json({ message: MESSAGES.SUCCESS.LOGOUT });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
