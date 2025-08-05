/**
 * Firebase Authentication Manager
 * Handles Firebase custom token authentication for RTDB access
 */
class FirebaseAuthManager {
  constructor() {
    this.database = null;
    this.isAuthenticated = false;
    this.currentUser = null;
    this.authStateListeners = [];
    this.reconnectTimer = null;
  }

  /**
   * Initialize Firebase for RTDB only (auth already initialized in authManager)
   */
  initialize() {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: "AIzaSyA4z-ifjabIh4bJBBsBJeuDfIkyMkoRHAE",
        databaseURL: "https://cosmoguru-server-default-rtdb.firebaseio.com",
        projectId: "cosmoguru-server"
      });
    }
    
    this.database = firebase.database();
    this.firestore = firebase.firestore();
    
    // Listen for auth state changes
    firebase.auth().onAuthStateChanged((user) => {
      this.handleAuthStateChange(user);
    });
    
    // Monitor connection state
    this.monitorConnection();
  }

  /**
   * Authenticate with Firebase using custom token
   */
  async authenticate(firebaseToken) {
    try {
      console.log('Authenticating with Firebase custom token...');
      
      // Sign in with custom token
      const credential = await firebase.auth().signInWithCustomToken(firebaseToken);
      
      // Get ID token to verify claims
      const idTokenResult = await credential.user.getIdTokenResult();
      console.log('Firebase auth successful. Claims:', idTokenResult.claims);
      
      this.isAuthenticated = true;
      this.currentUser = {
        uid: credential.user.uid,
        ...idTokenResult.claims
      };
      
      // Store token for reconnection
      this.storeFirebaseToken(firebaseToken);
      
      return true;
    } catch (error) {
      console.error('Firebase authentication error:', error);
      
      // Handle specific errors
      if (error.code === 'auth/invalid-custom-token') {
        console.error('Invalid Firebase token. Need to re-login.');
        this.handleTokenExpired();
      } else if (error.code === 'auth/network-request-failed') {
        console.error('Network error. Will retry...');
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Handle auth state changes
   */
  handleAuthStateChange(user) {
    if (user) {
      console.log('Firebase auth state: authenticated', user.uid);
      this.isAuthenticated = true;
      
      // Get fresh claims
      user.getIdTokenResult().then(idTokenResult => {
        this.currentUser = {
          uid: user.uid,
          ...idTokenResult.claims
        };
        
        // Notify listeners
        this.authStateListeners.forEach(listener => listener(true, this.currentUser));
      });
    } else {
      console.log('Firebase auth state: not authenticated');
      this.isAuthenticated = false;
      this.currentUser = null;
      
      // Notify listeners
      this.authStateListeners.forEach(listener => listener(false, null));
      
      // Try to re-authenticate if we have a stored token
      this.tryReauthenticate();
    }
  }

  /**
   * Add auth state listener
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
    // Call immediately with current state
    callback(this.isAuthenticated, this.currentUser);
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Store Firebase token securely
   */
  storeFirebaseToken(token) {
    try {
      sessionStorage.setItem('firebase_token', token);
    } catch (error) {
      console.error('Failed to store Firebase token:', error);
    }
  }

  /**
   * Get stored Firebase token
   */
  getStoredFirebaseToken() {
    try {
      return sessionStorage.getItem('firebase_token');
    } catch (error) {
      console.error('Failed to retrieve Firebase token:', error);
      return null;
    }
  }

  /**
   * Clear stored Firebase token
   */
  clearStoredFirebaseToken() {
    try {
      sessionStorage.removeItem('firebase_token');
    } catch (error) {
      console.error('Failed to clear Firebase token:', error);
    }
  }

  /**
   * Try to re-authenticate with stored token
   */
  async tryReauthenticate() {
    const storedToken = this.getStoredFirebaseToken();
    if (!storedToken) {
      console.log('No stored Firebase token found');
      return false;
    }
    
    try {
      console.log('Attempting to re-authenticate with stored token...');
      await this.authenticate(storedToken);
      return true;
    } catch (error) {
      console.error('Re-authentication failed:', error);
      this.clearStoredFirebaseToken();
      return false;
    }
  }

  /**
   * Handle token expiration
   */
  handleTokenExpired() {
    console.log('Firebase token expired, requesting fresh token...');
    this.clearStoredFirebaseToken();
    
    // Request fresh token from backend
    this.refreshFirebaseToken();
  }

  /**
   * Refresh Firebase token from backend
   */
  async refreshFirebaseToken() {
    try {
      const response = await apiClient.verifySession();
      if (response.valid && response.firebaseToken) {
        console.log('Got fresh Firebase token from backend');
        await this.authenticate(response.firebaseToken);
      } else {
        console.error('Session invalid, redirecting to login...');
        window.location.href = 'login.html';
      }
    } catch (error) {
      console.error('Failed to refresh Firebase token:', error);
      window.location.href = 'login.html';
    }
  }

  /**
   * Sign out from Firebase
   */
  async signOut() {
    try {
      await firebase.auth().signOut();
      this.clearStoredFirebaseToken();
      this.isAuthenticated = false;
      this.currentUser = null;
    } catch (error) {
      console.error('Firebase sign out error:', error);
    }
  }

  /**
   * Monitor Firebase connection state
   */
  monitorConnection() {
    const connectedRef = this.database.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
      const isConnected = snapshot.val() === true;
      console.log('Firebase connection state:', isConnected ? 'connected' : 'disconnected');
      
      if (isConnected && !this.isAuthenticated) {
        // Try to authenticate when connection is restored
        this.tryReauthenticate();
      }
      
      // Update UI connection status
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus(isConnected ? 'connected' : 'disconnected');
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect to Firebase...');
      this.tryReauthenticate();
    }, 5000); // Retry after 5 seconds
  }

  /**
   * Get database reference (ensures authentication)
   */
  async getRef(path) {
    if (!this.isAuthenticated) {
      console.warn('Attempting to access RTDB without authentication');
      const success = await this.tryReauthenticate();
      if (!success) {
        throw new Error('Not authenticated with Firebase');
      }
    }
    
    return this.database.ref(path);
  }

}

// Create singleton instance
const firebaseAuthManager = new FirebaseAuthManager();

// Export for use in other modules
window.firebaseAuthManager = firebaseAuthManager;