class WebinarApp {
  constructor() {
    this.user = null;
    this.uiPermissions = null;
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
      
      // Set up event listeners (after UI injection)
      this.setupEventListeners();
      
      // Watch for session end
      this.watchForSessionEnd();
      
    }catch (error) {
        console.error('Initialization error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Check for authentication errors that require login redirect
        const authErrors = [
          'session',
          'Invalid or expired token',
          'token',
          'expired',
          'unauthorized',
          'Invalid session'
        ];
        
        const shouldRedirect = authErrors.some(errorType => 
          error.message && error.message.toLowerCase().includes(errorType.toLowerCase())
        );

        if (shouldRedirect) {
          console.log('Authentication error detected, redirecting to login:', error.message);
          // Clear any stored tokens
          localStorage.removeItem('webinar_token');
          sessionStorage.removeItem('firebase_token');
          // Redirect immediately without alert to avoid showing empty page
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
      console.log('Injecting end session button for host...');
      const headerActions = document.querySelector('.header-actions');
      
      const endSessionBtnHTML = `
        <button class="end-btn header-btn" id="endSessionBtn">
          <i class="fas fa-power-off"></i> End
        </button>
      `;
      
      headerActions.insertAdjacentHTML('beforeend', endSessionBtnHTML);
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
    // Prevent tabbing into YouTube player
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const activeElement = document.activeElement;
            const playerContainer = document.getElementById('playerContainer');
            
            // Check if focus is about to enter the player area
            if (playerContainer && playerContainer.contains(activeElement)) {
                e.preventDefault();
                
                // Move focus to the next logical element (chat input)
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.focus();
                }
            }
        }
    });
    
    // Chat
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatManager.sendMessage();
      }
    });
    
    // Auto-resize textarea and show/hide send button
    messageInput.addEventListener('input', (e) => {
      // Show/hide send button
      sendBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
      
      // Auto-resize
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    });
    
    // Send button (inline) - event listener
    if (sendBtn) {
      sendBtn.addEventListener('click', () => chatManager.sendMessage());
    }
    
    // Exit button (header)
    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => this.handleExit());
    }
    
    // Fullscreen changes
    document.addEventListener('fullscreenchange', this.updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', this.updateFullscreenButton);
    
    // Network status
    // addEventListener('online', () => this.updateConnectionStatus('connected'));
    // addEventListener('offline', () => this.updateConnectionStatus('disconnected'));
    
    // Visibility tracking
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.updateSessionState('background', 'visibility');
      } else {
        this.updateSessionState('active', 'visibility');
        
        // Check if Firebase token expired while tab was hidden
        if (window.firebaseAuthManager && window.firebaseAuthManager.isTokenExpiringSoon(5)) {
            console.log('Firebase token expired/expiring while tab was hidden, refreshing...');
            window.firebaseAuthManager.refreshFirebaseToken().catch(error => {
            console.error('Failed to refresh expired token on tab focus:', error);
          });
        }
      }
    });

    // Exit detection
    addEventListener('beforeunload', (e) => {
      // Send beacon for reliable delivery
      const userId = this.user.role === 'host' ? this.user.uid : this.user.phone;
      const success = apiClient.sendBeacon(userId, 'closing', 'beforeunload');
      
      if (success) {
        console.log('Exit beacon sent successfully');
      } else {
        console.warn('Exit beacon failed to send');
      }
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

  async updateSessionState(state, source) {
    try {
      await apiClient.updateSessionState({ state, source });
      console.log(`Session state updated: ${state} (${source})`);
    } catch (error) {
      console.warn('Failed to update session state:', error);
    }
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

  async handleExit() {
    // Show confirmation modal for manual exit
    const confirmed = await ConfirmModal.confirm('Leave the session?', {
      title: 'Exit Session',
      confirmText: 'Leave',
      cancelText: 'Stay'
    });
    
    if (confirmed) {
      this.logout();
    }
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
    
    if (!await ConfirmModal.countdownConfirm('End session for all participants?', {
      title: '  End Session',
      confirmText: 'End Session',
      cancelText: 'Cancel',
      countdownSeconds: 3
    })) return;
    
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