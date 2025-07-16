/**
 * API Endpoint Definitions
 * Centralized location for all API endpoints
 */

const API_VERSION = '/api';

const ENDPOINTS = {
  // Authentication endpoints
  AUTH: {
    HOST_LOGIN: `${API_VERSION}/auth/host/login`,
    PARTICIPANT_LOGIN: `${API_VERSION}/auth/participant/login`,
    VERIFY_SESSION: `${API_VERSION}/auth/verify`,
    LOGOUT: `${API_VERSION}/auth/logout`
  },
  
  // Session management endpoints
  SESSION: {
    GET_COUNT: `${API_VERSION}/session/count`,
    GET_STATUS: `${API_VERSION}/session/status`,
    END_SESSION: `${API_VERSION}/session/end`
  },
  
  // Chat endpoints
  CHAT: {
    SEND_MESSAGE: `${API_VERSION}/chat/send`,
    GET_PARTICIPANTS: `${API_VERSION}/chat/participants`
  },
  
  // Stream endpoints
  STREAM: {
    GET_CONFIG: `${API_VERSION}/stream/config`
  },
  
  // Health check (no API prefix)
  HEALTH: '/health'
};

// WebSocket endpoints (for future implementation)
const WS_ENDPOINTS = {
  CHAT: '/ws/chat',
  NOTIFICATIONS: '/ws/notifications'
};

// External API endpoints
const EXTERNAL_APIS = {
  YOUTUBE: {
    IFRAME_API: 'https://www.youtube.com/iframe_api',
    THUMBNAIL: (videoId) => `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }
};

// Helper function to build URL with query parameters
const buildUrl = (endpoint, params = {}) => {
  const url = new URL(endpoint, window.location.origin);
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });
  return url.toString();
};

// Helper function to get full API URL
const getApiUrl = (endpoint) => {
  // In production, this might point to a different domain
  const baseUrl = window.API_BASE_URL || '';
  return `${baseUrl}${endpoint}`;
};

// Export everything
window.ENDPOINTS = ENDPOINTS;
window.WS_ENDPOINTS = WS_ENDPOINTS;
window.EXTERNAL_APIS = EXTERNAL_APIS;
window.buildUrl = buildUrl;
window.getApiUrl = getApiUrl;
window.API_VERSION = API_VERSION;