class WebinarApp {
  constructor() {
    this.user = null;
    this.uiPermissions = null;
    this.heartbeatManager = new HeartbeatManager();
  }

  async initialize() {
    console.log('Starting webinar initialization...');

    // Check if we have a token
    const token = localStorage.getItem('webinar_token');
    console.log('JWT token:', token ? 'Found' : 'Not found');

    if (!token) {
      console.log('No JWT token found, redirecting to login');
      location.href = 'login.html';
      return;
    }
    
    try {
      // Verify session with backend and get user data from JWT
      console.log('Calling verify session...');
      const response = await apiClient.verifySession();
      console.log('Verify response:', response);
      
      if (!response.valid) {
        console.error('Session invalid in response');
        throw new Error('Invalid session');
      }

      // Get user data from JWT (decoded by backend)
      this.user = response.user;
      console.log('User from JWT:', this.user);

      // Store UI permissions from backend
      this.uiPermissions = response.uiPermissions || {};
      console.log('UI Permissions:', this.uiPermissions);

      // Inject role-based UI elements before initializing components
      this.injectRoleBasedUI();

      // Initialize Firebase Auth Manager
      window.firebaseAuthManager.initialize();

      // Authenticate with Firebase if we have a token
      if (response.firebaseToken) {
        try {
          await firebaseAuthManager.authenticate(response.firebaseToken);
          console.log('Firebase RTDB authenticated successfully');
        } catch (error) {
          console.error('Firebase auth failed, continuing without RTDB:', error);
        }
      } else {
        console.warn('No Firebase token in verify response');
        // Try stored token as fallback
        const success = await firebaseAuthManager.tryReauthenticate();
        if (!success) {
          console.warn('Could not authenticate with Firebase RTDB');
        }
      }
      
      // Initialize components
      await streamPlayer.initialize();
      chatManager.initialize(this.user, this.uiPermissions);
      
      // Initialize heartbeat manager
      this.heartbeatManager.initialize(this.user);
      
      // Set up event listeners (after UI injection)
      this.setupEventListeners();
      
      // Watch for session end
      this.watchForSessionEnd();
      
    }catch (error) {
        console.error('Initialization error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Only show alert and redirect if it's actually a session error
        if (error.message && error.message.includes('session')) {
          alert('Session expired. Please login again.');
          location.href = 'login.html';
        } else {
          // For other errors, log but don't redirect
          console.error('Non-session error during initialization:', error);
        }
      }
  }

  injectRoleBasedUI() {
    console.log('Injecting role-based UI elements...');
    
    // Inject recipient selector for hosts and co-hosts
    if (this.uiPermissions.canSelectRecipients) {
      const chatContainer = document.querySelector('.chat-container');
      const chatMessages = document.querySelector('.chat-messages');
      
      const recipientSelectorHTML = `
        <div class="recipient-selector" id="recipientSelector">
          <select id="recipientSelect">
            <option value="all">All Participants</option>
          </select>
        </div>
      `;
      
      chatMessages.insertAdjacentHTML('beforebegin', recipientSelectorHTML);
      console.log('Recipient selector injected');
    }
    
    // Inject end session button for hosts only
    if (this.uiPermissions.canEndSession) {
      const messageInputContainer = document.querySelector('.message-input-container');
      
      const endSessionBtnHTML = `
        <button class="end-btn" id="endSessionBtn">
          <i class="fas fa-power-off"></i>
          End
        </button>
      `;
      
      messageInputContainer.insertAdjacentHTML('beforeend', endSessionBtnHTML);
      console.log('End session button injected');
    }
    
    console.log('UI injection completed');
    
    // Set up event listeners for dynamically injected elements
    this.setupDynamicEventListeners();
  }

  setupDynamicEventListeners() {
    // End session button (dynamically injected for hosts)
    const endBtn = document.getElementById('endSessionBtn');
    if (endBtn) {
      endBtn.addEventListener('click', () => this.endSession());
      console.log('End session button event listener attached');
    }
    
    // Recipient selector (dynamically injected for hosts/co-hosts)
    const recipientSelect = document.getElementById('recipientSelect');
    if (recipientSelect) {
      // Add event listener if needed for recipient selection
      console.log('Recipient selector found and ready');
      
      // Show the recipient selector
      const recipientSelector = document.getElementById('recipientSelector');
      if (recipientSelector) {
        recipientSelector.style.display = 'block';
      }
    }
  }

  setupEventListeners() {
    // Player controls
    document.getElementById('muteBtn').addEventListener('click', () => streamPlayer.toggleMute());
    document.getElementById('fullscreenBtn').addEventListener('click', () => streamPlayer.toggleFullscreen());
    document.getElementById('qualityBtn').addEventListener('click', () => 
      streamPlayer.showNotification('Quality settings coming soon', 'warning')
    );
    
    // Chat
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatManager.sendMessage();
      }
    });
    
    // Send button
    document.querySelector('.send-btn').addEventListener('click', () => chatManager.sendMessage());
    
    // Exit button
    document.querySelector('.exit-btn').addEventListener('click', () => this.logout());
    
    // Fullscreen changes
    document.addEventListener('fullscreenchange', this.updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', this.updateFullscreenButton);
    
    // Network status
    addEventListener('online', () => this.updateConnectionStatus('connected'));
    addEventListener('offline', () => this.updateConnectionStatus('disconnected'));
    
    // Prevent accidental refresh
    addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave?';
    });
  }

  updateFullscreenButton = () => {
    const btn = document.getElementById('fullscreenBtn');
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    btn.innerHTML = isFullscreen ? '<i class="fas fa-compress"></i> Exit' : '<i class="fas fa-expand"></i> Fullscreen';
  }

  updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.className = `connection-status ${status}`;
    
    const configs = {
      connected: { icon: 'fa-wifi', text: 'Connected' },
      disconnected: { icon: 'fa-wifi-slash', text: 'Disconnected' }
    };
    
    const config = configs[status];
    statusEl.innerHTML = `<i class="fas ${config.icon}"></i> <span>${config.text}</span>`;
  }

  watchForSessionEnd() {
    // Use authenticated Firebase instance
    const sessionEndedRef = firebase.database().ref('sessionEnded');
    
    sessionEndedRef.on('value', (snapshot) => {
      console.log('sessionEnded flag changed to:', snapshot.val());
      if (snapshot.val() === true) {
        console.log('Session ended by host');
        streamPlayer.showNotification('Session ended by host', 'error');
        setTimeout(() => this.logout(), 2000);
      }
    }, (error) => {
      console.error('Error watching session end:', error);
    });
  }

  async logout() {
    try {
      // Cleanup managers before logout
      if (window.chatManager) {
        chatManager.cleanup();
      }
      
      if (this.heartbeatManager) {
        this.heartbeatManager.cleanup();
      }
      
      await apiClient.logout();
      // apiClient.logout() already clears tokens via apiClient.clearToken()
      location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
      // Clean up managers even if API call fails
      if (window.chatManager) {
        chatManager.cleanup();
      }
      
      if (this.heartbeatManager) {
        this.heartbeatManager.cleanup();
      }
      
      // Clear tokens manually if API call fails
      localStorage.removeItem('webinar_token');
      sessionStorage.removeItem('firebase_token');
      location.href = 'login.html';
    }
  }

  async endSession() {
    console.log('End session called');
    console.log('User role:', this.user.role);
    
    if (this.user.role !== 'host') {
      streamPlayer.showNotification('Only hosts can end sessions', 'error');
      return;
    }
    
    if (!confirm('End session for all participants?')) return;
    
    try {
      console.log('Calling API to end session...');
      await apiClient.endSession();
      console.log('API call successful');
      streamPlayer.showNotification('Session ended', 'success');
      setTimeout(() => this.logout(), 1000);
    } catch (error) {
      console.error('End session error:', error);
      console.error('Error message:', error.message);
      streamPlayer.showNotification('Failed to end session', 'error');
    }
  }
}

// Initialize app
const webinarApp = new WebinarApp();
document.addEventListener('DOMContentLoaded', () => webinarApp.initialize());

// Global error handler
onerror = (msg, url, line, col, error) => {
  console.error('Global error:', { msg, url, line, col, error });
  return false;
};