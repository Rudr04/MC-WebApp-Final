const express = require('express');
const sessionService = require('../services/sessionService');
const { verifyToken, verifyHost } = require('../middleware/auth');
const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

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
    await sessionService.endSession(req.user.email);
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

// Update session state (authenticated)
router.post('/state', verifyToken, async (req, res, next) => {
  try {
    const { state, source } = req.body;
    const { user } = req;
    
    if (!state || !source) {
      return res.status(400).json({ error: 'Missing state or source' });
    }
    
    await sessionService.updateUserState(user, state, source);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Beacon endpoint for beforeunload (no auth)
router.post('/beacon', async (req, res, next) => {
  try {
    const { userId, state, source } = req.body;
    
    if (!userId || !state || !source) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await sessionService.updateUserStateByUserId(userId, state, source);
    res.json({ success: true });
  } catch (error) {
    console.error('Beacon error:', error);
    // Always return success for beacon to avoid retries
    res.json({ success: true });
  }
});

module.exports = router;