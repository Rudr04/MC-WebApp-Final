class WebinarApp {
  constructor() {
    this.user = null;
  }

  async initialize() {
    console.log('Starting webinar initialization...');

    // Check authentication
    const userStr = sessionStorage.getItem('user');
    console.log('User from session:', userStr ? 'Found' : 'Not found');

    if (!userStr) {
      location.href = 'login.html';
      return;
    }
    
    try {
      this.user = JSON.parse(userStr);
      console.log('Parsed user:', this.user);

      // Check if we have a token
      const token = localStorage.getItem('webinar_token');
      console.log('JWT token:', token ? 'Found' : 'Not found');

      // Verify session with backend
      console.log('Calling verify session...');
      const response = await apiClient.verifySession();
      console.log('Verify response:', response);
      
      if (!response.valid) {
        console.error('Session invalid in response');
        throw new Error('Invalid session');
      }

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
      chatManager.initialize(this.user);
      
      // Show host controls if applicable
      if (this.user.role === 'host') {
        document.getElementById('endSessionBtn').style.display = 'flex';
      }
      
      // Set up event listeners
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
    
    // End session button (host only)
    const endBtn = document.getElementById('endSessionBtn');
    if (endBtn) endBtn.addEventListener('click', () => this.endSession());
    
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
      await apiClient.logout();
      sessionStorage.clear();
      location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
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