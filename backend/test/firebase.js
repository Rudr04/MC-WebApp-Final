const admin = require('firebase-admin');
const config = require('./config');
const { logger } = require('../utils/logger');

// Initialize Firebase Admin
let db, auth;

try {
  // Debug: Log configuration status
  logger.info('Initializing Firebase Admin SDK...');
  
  // Check if required config exists
  if (!config.firebase.projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }
  if (!config.firebase.privateKey) {
    throw new Error('Missing FIREBASE_PRIVATE_KEY');
  }
  if (!config.firebase.clientEmail) {
    throw new Error('Missing FIREBASE_CLIENT_EMAIL');
  }
  
  // Log config (without sensitive data)
  logger.info('Firebase config:', {
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    databaseURL: config.firebase.databaseURL,
    privateKeyLength: config.firebase.privateKey ? config.firebase.privateKey.length : 0
  });
  
  const serviceAccount = {
    projectId: config.firebase.projectId,
    privateKey: config.firebase.privateKey,
    clientEmail: config.firebase.clientEmail
  };
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
  });
  
  db = admin.database();
  auth = admin.auth();
  
  // Test Firebase Admin SDK
  logger.info('Firebase Admin initialized successfully');
  
  // Test database connection
  db.ref('.info/connected').on('value', (snapshot) => {
    logger.info('Firebase Realtime Database connection:', snapshot.val() ? 'connected' : 'disconnected');
  });
  
  // Test auth functionality by trying to get a user (should fail gracefully if no users)
  auth.listUsers(1)
    .then(() => {
      logger.info('Firebase Auth Admin API is working');
    })
    .catch((error) => {
      if (error.code === 'auth/project-not-found') {
        logger.error('Firebase project not found. Check your project ID.');
      } else if (error.code === 'auth/invalid-credential') {
        logger.error('Invalid Firebase credentials. Check your service account key.');
      } else {
        logger.warn('Firebase Auth test:', error.message);
      }
    });
    
} catch (error) {
  logger.error('Firebase initialization error:', error);
  logger.error('Stack trace:', error.stack);
  
  // Check for common issues
  if (error.message.includes('private_key')) {
    logger.error('Private key issue. Make sure FIREBASE_PRIVATE_KEY is properly formatted with \\n characters.');
    logger.error('The private key should start with "-----BEGIN PRIVATE KEY-----" and end with "-----END PRIVATE KEY-----"');
  }
  
  process.exit(1);
}

module.exports = { admin, db, auth };