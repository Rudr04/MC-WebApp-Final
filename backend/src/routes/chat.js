const express = require('express');
const chatService = require('../services/chatService');
const { verifyToken, verifyHost } = require('../middleware/auth');
const { validateSendMessage } = require('../utils/validator');
const { messageLimiter, perUserRateLimiter } = require('../middleware/rateLimit');
const { MESSAGES } = require('../config/constants');

const router = express.Router();

// Send message with rate limiting and validation
router.post('/send', 
  verifyToken, 
  messageLimiter,
  perUserRateLimiter(10, 1), // 30 messages per minute per user
  validateSendMessage,
  async (req, res, next) => {
    try {
      const { message, to } = req.body;
      await chatService.sendMessage(req.user, message, to);
      res.json({ 
        success: true,
        message: MESSAGES.SUCCESS.MESSAGE_SENT 
      });
    } catch (error) {
      next(error);
    }
});

// Get participants list (host only)
router.get('/participants', 
  verifyToken, 
  verifyHost, 
  async (req, res, next) => {
    try {
      const participants = await chatService.getParticipants();
      res.json({ participants });
    } catch (error) {
      next(error);
    }
});

module.exports = router;