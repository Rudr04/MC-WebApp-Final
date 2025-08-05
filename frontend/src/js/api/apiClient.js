class ApiClient {
  constructor() {
    this.baseURL = 'http://localhost:3001';
    // Don't load token in constructor - load it dynamically
  }

  // Getter for token - always gets fresh value from localStorage
  get token() {
    return localStorage.getItem('webinar_token');
  }

  get firebaseToken() {
    return sessionStorage.getItem('firebase_token');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      }
    };

    // Add auth token if available
    const isLoginEndpoint = endpoint.includes('/auth/host/login') || 
                            endpoint.includes('/auth/participant/login');
    
    const currentToken = this.token; // Use getter
    
    if (currentToken && !isLoginEndpoint) {
      config.headers.Authorization = `Bearer ${currentToken}`;
    }

    try {
      const response = await fetch(url, config);
      
      // Check for refreshed token
      const newToken = response.headers.get('X-New-Token');
      if (newToken) {
        this.setToken(newToken);
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('webinar_token', token);
      console.log('Token stored successfully');
    }
  }

  setFirebaseToken(token) {
    if (token) {
      sessionStorage.setItem('firebase_token', token);
      console.log('Firebase token stored successfully');
    }
  }

  clearToken() {
    localStorage.removeItem('webinar_token');
    sessionStorage.removeItem('firebase_token');
  }

  // Auth endpoints
  async loginHost(firebaseToken) {
    console.log('Logging in host...');
    const response = await this.request(window.ENDPOINTS.AUTH.HOST_LOGIN, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firebaseToken}`
      }
    });
    
    if (response.token) {
      this.setToken(response.token);
    }

    if (response.firebaseToken) {
      this.setFirebaseToken(response.firebaseToken);
    }
    
    return response;
  }

  async loginParticipant(phone) {
    console.log('Logging in participant...');
    const response = await this.request(window.ENDPOINTS.AUTH.PARTICIPANT_LOGIN, {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
    
    if (response.token) {
      this.setToken(response.token);
      console.log('Participant token set:', response.token.substring(0, 20) + '...');
    } else {
      console.error('WARNING: No token in participant login response');
    }
    if (response.firebaseToken) {
      this.setFirebaseToken(response.firebaseToken);
    }
    
    return response;
  }

  async verifySession() {
    console.log('Verifying session...');
    return this.request(window.ENDPOINTS.AUTH.VERIFY_SESSION);
  }

  async logout() {
    await this.request(window.ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
    this.clearToken();
  }

  // Session endpoints
  async getSessionCount() {
    return this.request(window.ENDPOINTS.SESSION.GET_COUNT);
  }

  async getSessionStatus() {
    return this.request(window.ENDPOINTS.SESSION.GET_STATUS);
  }

  async endSession() {
    return this.request(window.ENDPOINTS.SESSION.END_SESSION, { method: 'POST' });
  }

  async sendHeartbeat(userId, userState, timestamp, isStateChange = false) {
    return this.request(window.ENDPOINTS.SESSION.HEARTBEAT, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        userState,
        timestamp,
        isStateChange
      })
    });
  }

  async sendBeacon(userId, userState, timestamp) {
    // Beacon endpoint doesn't use authentication
    const url = `${this.baseURL}${window.ENDPOINTS.SESSION.BEACON}`;
    const payload = {
      userId,
      userState,
      timestamp
    };
    
    // Try sendBeacon first, fallback to fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } else {
      // Fallback to regular fetch
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        return response.ok;
      } catch (error) {
        console.error('Beacon fallback failed:', error);
        return false;
      }
    }
  }

  // Chat endpoints
  async sendMessage(message, to) {
    return this.request(window.ENDPOINTS.CHAT.SEND_MESSAGE, {
      method: 'POST',
      body: JSON.stringify({ message, to })
    });
  }

  async getParticipants() {
    return this.request(window.ENDPOINTS.CHAT.GET_PARTICIPANTS);
  }

  // Stream endpoints
  async getStreamConfig() {
    console.log('Getting stream config...');
    return this.request(window.ENDPOINTS.STREAM.GET_CONFIG);
  }
}

// Create singleton instance
const apiClient = new ApiClient();

// Make it available globally
window.apiClient = apiClient;