const express = require('express');
const sessionService = require('../services/sessionService');
const { verifyToken, verifyHost } = require('../middleware/auth');

const router = express.Router();

// Get active sessions count
router.get('/count', async (req, res, next) => {
  try {
    const count = await sessionService.getActiveSessionsCount();
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// End session (host only)
router.post('/end', verifyToken, verifyHost, async (req, res, next) => {
  try {
    await sessionService.endSession(req.user.uid);
    res.json({ message: 'Session ended successfully' });
  } catch (error) {
    next(error);
  }
});

// Check if session is active
router.get('/status', async (req, res, next) => {
  try {
    const hasActiveSession = await sessionService.hasActiveHostSession();
    res.json({ active: hasActiveSession });
  } catch (error) {
    next(error);
  }
});

module.exports = router;