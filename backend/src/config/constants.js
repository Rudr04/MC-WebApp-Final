module.exports = {
  // User roles
  ROLES: {
    HOST: 'host',
    CO_HOST: 'co-host',
    PARTICIPANT: 'participant'
  },
  
  // Validation constants
  VALIDATION: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    MESSAGE_MAX_LENGTH: 500,
    PHONE_REGEX: /^\+[1-9]\d{1,14}$/,
    NAME_REGEX: /^[a-zA-Z\s]+$/
  },
  
  // Firebase paths
  FIREBASE_PATHS: {
    WHITELIST: 'whitelist',
    ACTIVE_HOSTS: 'activeHosts',
    ACTIVE_CO_HOSTS: 'activeCoHosts',
    ACTIVE_SESSIONS: 'activeSessions',
    USERS: 'users',
    MESSAGES: 'messages',
    SESSION_ENDED: 'sessionEnded'
  },
  
  // Response messages
  MESSAGES: {
    SUCCESS: {
      LOGIN: 'Login successful',
      LOGOUT: 'Logged out successfully',
      MESSAGE_SENT: 'Message sent successfully',
      SESSION_ENDED: 'Session ended successfully'
    },
    ERROR: {
      UNAUTHORIZED: 'Unauthorized access',
      INVALID_TOKEN: 'Invalid or expired token',
      NO_TOKEN: 'No authentication token provided',
      ACCESS_DENIED: 'Access denied',
      HOST_ONLY: 'This action requires host privileges',
      NOT_WHITELISTED: 'Phone number not authorized',
      ALREADY_IN_SESSION: 'Phone number already in use',
      NO_ACTIVE_SESSION: 'No active session found',
      INVALID_INPUT: 'Invalid input provided',
      SESSION_EXPIRED: 'Session has expired',
      RATE_LIMIT: 'Too many requests'
    }
  },
  
  // HTTP Status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500
  },
  
  // Token expiry times
  TOKEN_EXPIRY: {
    ACCESS_TOKEN: '24h',
    REFRESH_TOKEN: '7d'
  },
  
  // Cache TTL (in seconds)
  CACHE_TTL: {
    PARTICIPANT_COUNT: 10,
    PARTICIPANTS_LIST: 30,
    SESSION_STATUS: 5
  },
  
  // WebSocket events (for future implementation)
  WS_EVENTS: {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    MESSAGE: 'message',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    SESSION_END: 'session_end'
  },
  
  // Limits
  LIMITS: {
    MAX_MESSAGE_LENGTH: 500,
    MAX_NAME_LENGTH: 50,
    MIN_NAME_LENGTH: 2,
    MAX_CONCURRENT_SESSIONS: 1,
    MAX_RETRY_ATTEMPTS: 3
  }
};