const express = require('express');
const authService = require('../services/authService');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validateParticipantLogin } = require('../utils/validator');
const { authLimiter, participantJoinLimiter } = require('../middleware/rateLimit');
const { MESSAGES, HTTP_STATUS } = require('../config/constants');

const router = express.Router();

// Host login with rate limiting
router.post('/host/login', verifyFirebaseToken, async (req, res, next) => {
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
      const { name, phone } = req.body;
      const result = await authService.authenticateParticipant(name, phone);
      res.json({
        ...result,
        message: MESSAGES.SUCCESS.LOGIN
      });
    } catch (error) {
      next(error);
    }
});

// Verify session
router.get('/verify', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await authService.verifySession(token);
    res.json(result);
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
