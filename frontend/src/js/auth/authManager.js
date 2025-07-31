class AuthManager {
  constructor() {
    this.currentUser = null;
    this.firebaseConfig = null;
  }

  async initialize() {
    // Initialize Firebase (config will come from backend in production)
    // For now, we'll use a minimal config just for auth
    const firebaseConfig = {
      apiKey: "AIzaSyA4z-ifjabIh4bJBBsBJeuDfIkyMkoRHAE",
      authDomain: "cosmoguru-server.firebaseapp.com",
      projectId: "cosmoguru-server"
    };

    firebase.initializeApp(firebaseConfig);
    this.auth = firebase.auth();
  }

  async loginWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      const result = await this.auth.signInWithPopup(provider);
      const idToken = await result.user.getIdToken();
      
      // Send token to backend for verification
      const response = await apiClient.loginHost(idToken);
      
      this.currentUser = response.user;
      return response;
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  }

  async loginParticipant(phone) {
    const response = await apiClient.loginParticipant(phone);
    this.currentUser = response.user;
    return response;
  }

  async logout() {
    await apiClient.logout();
    
    if (this.auth.currentUser) {
      await this.auth.signOut();
    }
    
    this.currentUser = null;
  }

  isAuthenticated() {
    return !!apiClient.token;
  }

  getUser() {
    return this.currentUser;
  }
}

const authManager = new AuthManager();

window.authManager;