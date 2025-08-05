require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { logger } = require('./utils/logger');
const { errorHandler } = require('./middleware/error');
const { generalApiLimiter } = require('./middleware/rateLimit');
const sessionMonitor = require('./services/sessionMonitor');
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/session');
const chatRoutes = require('./routes/chat');
const streamRoutes = require('./routes/stream');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all API routes
// app.use('/api/', generalApiLimiter);

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stream', streamRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port http://localhost:${PORT}`);
  
  // Start session monitor after server is ready
  sessionMonitor.start();
  logger.info('Session monitor started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  sessionMonitor.stop();
  app.close(() => {
    logger.info('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  sessionMonitor.stop();
  process.exit(0);
});