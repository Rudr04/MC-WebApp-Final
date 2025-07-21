class ChatManager {
  constructor() {
    this.firebase = null;
    this.messagesRef = null;
    this.currentUser = null;
  }

  initialize(user) {
    this.currentUser = user;
    
    // Initialize Firebase for realtime database only
    this.firebase = firebase.database();
  
    // Check if Firebase is authenticated
    if (!firebaseAuthManager.isAuthenticated) {
      console.warn('Firebase not authenticated, chat features may be limited');
    }
    this.messagesRef = this.firebase.ref('messages');
    
    // Set up listeners
    this.setupMessageListener();
    this.updateParticipantCount();
    
    // Load participants if host
    if (this.currentUser.role === 'host' || this.currentUser.role === 'co-host') {
      this.loadParticipantsList();
      document.getElementById('recipientSelector').style.display = 'block';
    }
  }

  setupMessageListener() {
    this.messagesRef.orderByChild('timestamp').on('child_added', snapshot => {
      const message = snapshot.val();
      if (!message) return;
      
      // Filter messages for participants
      if (this.currentUser.role === 'participant') {
        const shouldShow = message.to === 'all' ||
                          message.to === this.currentUser.phone ||
                          message.fromId === this.currentUser.phone;
        if (!shouldShow) return;
      }
      
      this.displayMessage(message);
    });
  }

  displayMessage(message) {
    const messagesList = document.getElementById('messagesList');
    const messageEl = document.createElement('div');
    
    const isHost = message.from.startsWith('host:') || message.from.startsWith('co-host:');
    const isPrivate = message.to !== 'all';
    const senderName = message.from.split(':')[1] || 'Unknown';
    
    messageEl.className = `message ${isHost ? 'host' : 'participant'} ${isPrivate ? 'private' : ''}`;
    messageEl.innerHTML = `
      <div class="message-sender">
        <i class="fas fa-${isHost ? 'crown' : 'user'}"></i>
        ${senderName}
        ${isPrivate ? `→ ${message.to === this.currentUser.phone ? 'You' : message.to}` : ''}
      </div>
      <div class="message-text">${this.linkify(message.text)}</div>
    `;
    
    messagesList.appendChild(messageEl);
    
    // Auto-scroll
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  linkify(text) {
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    const urlRegex = /((https?:\/\/)?([\w-]+\.)+[\w]{2,}(\/[^\s]*)?)/gi;
    return escapeHtml(text).replace(urlRegex, (match) => {
      let url = match;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      return `<a href="${url}" target="_blank" rel="noopener">${match}</a>`;
    });
  }

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) {
      this.showNotification('Please enter a message', 'warning');
      return;
    }
    
    const recipient = (this.currentUser.role === 'host' || this.currentUser.role === 'co-host') ? 
      document.getElementById('recipientSelect').value : 'host';
    
    try {
      await apiClient.sendMessage(message, recipient);
      input.value = '';
      input.focus();
    } catch (error) {
      this.showNotification('Failed to send message', 'error');
    }
  }

  async updateParticipantCount() {
    const activeSessionsRef = this.firebase.ref('activeSessions');
    
    activeSessionsRef.on('value', (snapshot) => {
      const count = snapshot.numChildren();
      document.getElementById('participantNumber').textContent = count;
    });
  }

  async loadParticipantsList() {
    // Use real-time listener for users
    const usersRef = this.firebase.ref('users');
    
    usersRef.on('value', (snapshot) => {
      const participants = [];
      snapshot.forEach(child => {
        const data = child.val();
        if (data.role === 'participant') {
          participants.push({
            id: child.key,
            name: data.name,
          });
        }
      });
      
      const select = document.getElementById('recipientSelect');
      select.innerHTML = '<option value="all">All Participants</option>';
      participants.forEach(participant => {
        select.innerHTML += `<option value="${participant.id}">${participant.name}</option>`;
      });
    });
  }

  showNotification(message, type) {
    streamPlayer.showNotification(message, type);
  }
}

const chatManager = new ChatManager();