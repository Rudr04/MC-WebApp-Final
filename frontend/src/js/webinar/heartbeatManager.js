class HeartbeatManager {
  constructor() {
    this.user = null;
    this.isActive = true;
    this.lastActivity = Date.now();
    this.currentState = 'active';
    this.heartbeatTimer = null;
    this.stateCheckTimer = null;
    this.isTabVisible = true;
    this.isDestroyed = false;
    
    // Configuration matching backend
    this.config = {
      INTERVALS: {
        ACTIVE: 180000,          // 3 minutes
        IDLE: 300000,           // 5 minutes
        BACKGROUND: 600000      // 10 minutes
      },
      JITTER_RANGE: 30000,      // ±30 seconds randomization
      INITIAL_DELAY_MAX: 60000, // Max 60s initial delay
      STATE_CHECK_INTERVAL: 60000, // Check state every minute
      ACTIVITY_TIMEOUT: 600000  // 10 minutes of inactivity = idle
    };
    
    // Activity tracking
    this.activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    this.boundActivityHandler = this.handleActivity.bind(this);
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
    this.boundBeforeUnloadHandler = this.handleBeforeUnload.bind(this);
  }

  initialize(user) {
    if (this.isDestroyed) {
      console.warn('Cannot initialize destroyed HeartbeatManager');
      return;
    }
    
    this.user = user;
    console.log('HeartbeatManager initialized for:', user.name);
    
    // Set up activity tracking
    this.setupActivityTracking();
    
    // Set up visibility tracking
    this.setupVisibilityTracking();
    
    // Set up beforeunload handler for beacon
    this.setupBeforeUnloadHandler();
    
    // Start state monitoring
    this.startStateMonitoring();
    
    // Schedule first heartbeat with initial random delay
    const initialDelay = Math.random() * this.config.INITIAL_DELAY_MAX;
    console.log(`Initial heartbeat scheduled in ${Math.round(initialDelay / 1000)}s`);
    
    this.heartbeatTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        this.sendHeartbeat();
      }
    }, initialDelay);
  }

  setupActivityTracking() {
    this.activityEvents.forEach(event => {
      document.addEventListener(event, this.boundActivityHandler, true);
    });
  }

  setupVisibilityTracking() {
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
  }

  setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', this.boundBeforeUnloadHandler);
  }

  handleActivity() {
    if (this.isDestroyed) return;
    
    const now = Date.now();
    const wasActive = this.currentState === 'active';
    this.lastActivity = now;
    
    // If we were idle/background and now have activity, immediately transition to active
    if (!wasActive) {
      this.updateState('active');
    }
  }

  handleVisibilityChange() {
    if (this.isDestroyed) return;
    
    this.isTabVisible = !document.hidden;
    console.log('Tab visibility changed:', this.isTabVisible ? 'visible' : 'hidden');
    
    // Determine new state based on visibility and activity
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    
    let newState;
    if (!this.isTabVisible) {
      newState = 'background';
    } else if (timeSinceActivity > this.config.ACTIVITY_TIMEOUT) {
      newState = 'idle';
    } else {
      newState = 'active';
    }
    
    this.updateState(newState);
  }

  handleBeforeUnload() {
    if (this.isDestroyed || !this.user) return;
    
    // Send final heartbeat using beacon API
    const userId = this.user.uid || this.user.phone;
    const success = window.apiClient.sendBeacon(userId, 'offline', Date.now());
    if (success) {
      console.log('Beacon sent on page unload');
    }
  }

  startStateMonitoring() {
    this.stateCheckTimer = setInterval(() => {
      if (this.isDestroyed) return;
      
      const now = Date.now();
      const timeSinceActivity = now - this.lastActivity;
      
      let newState;
      if (!this.isTabVisible) {
        newState = 'background';
      } else if (timeSinceActivity > this.config.ACTIVITY_TIMEOUT) {
        newState = 'idle';
      } else {
        newState = 'active';
      }
      
      if (newState !== this.currentState) {
        this.updateState(newState);
      }
    }, this.config.STATE_CHECK_INTERVAL);
  }

  updateState(newState) {
    if (this.isDestroyed || newState === this.currentState) return;
    
    const oldState = this.currentState;
    this.currentState = newState;
    
    console.log(`State changed: ${oldState} -> ${newState}`);
    
    // Clear existing timer
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Send immediate heartbeat on state change
    this.sendHeartbeat(true);
  }

  generateJitter() {
    // Generate random jitter between -JITTER_RANGE and +JITTER_RANGE
    return (Math.random() - 0.5) * 2 * this.config.JITTER_RANGE;
  }

  scheduleNextHeartbeat() {
    if (this.isDestroyed) return;
    
    const baseInterval = this.config.INTERVALS[this.currentState.toUpperCase()];
    const jitter = this.generateJitter();
    const actualInterval = baseInterval + jitter;
    
    console.log(`Next heartbeat scheduled in ${Math.round(actualInterval / 1000)}s (${this.currentState} + ${Math.round(jitter / 1000)}s jitter)`);
    
    this.heartbeatTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        this.sendHeartbeat();
      }
    }, actualInterval);
  }

  async sendHeartbeat(isStateChange = false) {
    if (this.isDestroyed || !this.user) return;
    
    // Only send heartbeat if tab is visible, unless it's a state change
    if (!this.isTabVisible && !isStateChange) {
      console.log('Skipping heartbeat - tab not visible');
      this.scheduleNextHeartbeat();
      return;
    }
    
    const userId = this.user.uid || this.user.phone;
    const timestamp = Date.now();
    
    try {
      const response = await window.apiClient.sendHeartbeat(
        userId,
        this.currentState,
        timestamp,
        isStateChange
      );
      
      console.log(`Heartbeat sent successfully (${this.currentState}${isStateChange ? ' - state change' : ''})`);
      
    } catch (error) {
      console.error('Heartbeat failed:', error);
      
      // Implement retry logic for network errors
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
        console.log('Retrying heartbeat in 30 seconds...');
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.sendHeartbeat(isStateChange);
          }
        }, 30000);
        return; // Don't schedule next heartbeat yet
      }
      
      // For auth errors, let the app handle token expiration
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.error('Heartbeat authentication failed - token may be expired');
      }
    }
    
    // Schedule next heartbeat
    this.scheduleNextHeartbeat();
  }

  cleanup() {
    console.log('Cleaning up HeartbeatManager...');
    this.isDestroyed = true;
    
    // Clear timers
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.stateCheckTimer) {
      clearInterval(this.stateCheckTimer);
      this.stateCheckTimer = null;
    }
    
    // Remove event listeners
    this.activityEvents.forEach(event => {
      document.removeEventListener(event, this.boundActivityHandler, true);
    });
    
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    window.removeEventListener('beforeunload', this.boundBeforeUnloadHandler);
    
    // Send final beacon if user data exists
    if (this.user) {
      this.handleBeforeUnload();
    }
    
    console.log('HeartbeatManager cleanup completed');
  }

  // Public method to get current state (for debugging)
  getStatus() {
    return {
      currentState: this.currentState,
      isTabVisible: this.isTabVisible,
      lastActivity: new Date(this.lastActivity).toISOString(),
      timeSinceActivity: Date.now() - this.lastActivity,
      isDestroyed: this.isDestroyed
    };
  }
}

// Export for module systems or make globally available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HeartbeatManager;
} else {
  window.HeartbeatManager = HeartbeatManager;
}