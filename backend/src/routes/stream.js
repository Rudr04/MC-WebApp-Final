const express = require('express');
const config = require('../config/config');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get stream configuration
router.get('/config', verifyToken, (req, res) => {
  res.json({
    videoId: config.youtube.videoId,
    // Add any other stream configuration here
  });
});

module.exports = router;