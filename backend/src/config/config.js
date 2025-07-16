module.exports = {
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development'
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  },
  youtube: {
    videoId: process.env.YOUTUBE_VIDEO_ID || 'GyUQDxkH_08'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY || '24h'
  },
  allowedHosts: process.env.ALLOWED_HOSTS?.split(',').reduce((acc, host) => {
    const [email, role] = host.split(':');
    acc[email] = role;
    return acc;
  }, {}) || {},
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000'
  }
};