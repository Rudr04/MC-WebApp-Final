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

// Heartbeat endpoint (authenticated)
router.post('/heartbeat', verifyToken, async (req, res, next) => {
  try {
    const { userId, userState, timestamp, isStateChange } = req.body;
    const user = req.user;
    
    // Validate input
    if (!userId || !userState || !timestamp) {
      return res.status(400).json({ error: 'Missing required heartbeat data' });
    }
    
    // Validate user state
    const validStates = ['active', 'idle', 'background'];
    if (!validStates.includes(userState)) {
      return res.status(400).json({ error: 'Invalid user state' });
    }
    
    // Ensure user can only update their own heartbeat
    const expectedUserId = user.uid || user.phone;
    if (userId !== expectedUserId) {
      return res.status(403).json({ error: 'Cannot update heartbeat for other users' });
    }
    
    // Update heartbeat in Firebase
    const userPath = `users/${userId}`;
    await db.ref(userPath).update({
      lastHeartbeat: timestamp,
      userState: userState,
      lastStateChange: isStateChange ? timestamp : null
    });
    
    logger.info(`Heartbeat updated for ${user.name || userId}: ${userState}${isStateChange ? ' (state change)' : ''}`);
    
    res.json({ success: true, timestamp: Date.now() });
    
  } catch (error) {
    logger.error('Heartbeat error:', error);
    next(error);
  }
});

// Beacon endpoint (no auth - for page unload)
router.post('/beacon', async (req, res, next) => {
  try {
    const { userId, userState, timestamp } = req.body;
    
    // Validate input
    if (!userId || !timestamp) {
      return res.status(400).json({ error: 'Missing required beacon data' });
    }
    
    // Mark session for immediate cleanup
    const userPath = `users/${userId}`;
    await db.ref(userPath).update({
      lastHeartbeat: timestamp,
      userState: userState || 'offline',
      beaconReceived: true,
      beaconTimestamp: timestamp
    });
    
    logger.info(`Beacon received for ${userId}: marked for cleanup`);
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error('Beacon error:', error);
    // Don't use next(error) for beacon as it might not complete
    res.status(500).json({ error: 'Beacon processing failed' });
  }
});

module.exports = router;