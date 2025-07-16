class WebinarApp {
  constructor() {
    this.user = null;
  }

  async initialize() {
    // Check authentication
    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
      location.href = 'login.html';
      return;
    }
    
    try {
      this.user = JSON.parse(userStr);

      // Log token details
      const token = localStorage.getItem('webinar_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('Token expires at:', new Date(payload.exp * 1000));
        console.log('Current time:', new Date());
      }
      
      // Verify session with backend
      const response = await apiClient.verifySession();
      if (!response.valid) throw new Error('Invalid session');
      console.log('Session verification response:', response);
      
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
      
    } catch (error) {
      console.error('Initialization error:', error);
      alert('Session expired. Please login again.');
      location.href = 'login.html';
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
    if (chatManager?.firebase) {
      chatManager.firebase.ref('sessionEnded').on('value', (snapshot) => {
        console.log('sessionEnded flag changed to:', snapshot.val());
        if (snapshot.val() === true) {
          console.log('Session ended by host - this is why you\'re being logged out');
          streamPlayer.showNotification('Session ended by host', 'error');
          setTimeout(() => this.logout(), 2000);
        }
      });
    }
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
    if (this.user.role !== 'host') {
      streamPlayer.showNotification('Only hosts can end sessions', 'error');
      return;
    }
    
    if (!confirm('End session for all participants?')) return;
    
    try {
      await apiClient.endSession();
      streamPlayer.showNotification('Session ended', 'success');
      setTimeout(() => this.logout(), 1000);
    } catch (error) {
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