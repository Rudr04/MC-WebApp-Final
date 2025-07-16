const admin = require('firebase-admin');
const config = require('./config');
const { logger } = require('../utils/logger');

// Initialize Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey,
      clientEmail: config.firebase.clientEmail
    }),
    databaseURL: config.firebase.databaseURL
  });
  
  logger.info('Firebase Admin initialized successfully');
} catch (error) {
  logger.error('Firebase initialization error:', error);
  process.exit(1);
}

const db = admin.database();
const auth = admin.auth();

module.exports = { admin, db, auth };