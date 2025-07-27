class ChatManager {
  constructor() {
    this.firebase = null;
    this.messagesRef = null;
    this.currentUser = null;
    this.uiPermissions = null;
    this.sending = null;
    this.participantsMap = new Map();
  }

  initialize(user, uiPermissions = {}) {
    this.currentUser = user;
    this.uiPermissions = uiPermissions;
    
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
    
    // Load participants if user has recipient selection permissions
    if (this.uiPermissions.canSelectRecipients) {
      this.loadParticipantsList();
      // Check if recipientSelector exists (might be injected after this call)
      const recipientSelector = document.getElementById('recipientSelector');
      if (recipientSelector) {
        recipientSelector.style.display = 'block';
      }
    }
  }

  getParticipantName(phoneOrId) {
    if (phoneOrId === 'all') return 'All';
    if (phoneOrId === 'host') return 'Host';
    if (phoneOrId === this.currentUser.phone) return 'You';
    
    // Try to get name from participants map
    const name = this.participantsMap.get(phoneOrId);
    return name || phoneOrId; // Return phone if name not found
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

  selectParticipant(participantPhone) {
    const select = document.getElementById('recipientSelect');
    
    // Find and select the option by phone number
    for (let option of select.options) {
      if (option.value === participantPhone) {
        option.selected = true;
        // Visual feedback
        this.showNotification(`Selected: ${option.text}`, 'success');
        
        // Optionally scroll to the input
        document.getElementById('messageInput').focus();
        break;
      }
    }
  }

  displayMessage(message) {
    const messagesList = document.getElementById('messagesList');
    const messageEl = document.createElement('div');
    
    // Extract role and name from "from" field (e.g., "participant:Rudr Bhatt")
    const [senderRole, ...senderNameParts] = message.from.split(':');
    const senderName = senderNameParts.join(':') || 'Unknown';
    const isHost = message.from.startsWith('host:') || message.from.startsWith('co-host:');
    const isPrivate = message.to !== 'all';
    const senderId = message.fromId; // Phone number of sender
    
    // Get recipient display name
    const recipientDisplay = this.getParticipantName(message.to);

    messageEl.className = `message ${isHost ? 'host' : 'participant'} ${isPrivate ? 'private' : ''}`;

    // Create clickable sender only for users with recipient selection permissions
    const canClickSender = this.uiPermissions.canSelectRecipients 
                          && senderId !== this.currentUser.phone;
    
    const senderElement = canClickSender
      ? `<span class="clickable-sender" data-sender-id="${senderId}" style="cursor: pointer;">
          <i class="fas fa-${isHost ? 'crown' : 'user'}"></i>
          ${senderName}
        </span>`
      : `<i class="fas fa-${isHost ? 'crown' : 'user'}"></i> ${senderName}`;

      messageEl.innerHTML = `
      <div class="message-sender">
        ${senderElement}
        ${isPrivate ? `→ ${recipientDisplay}` : ''}
      </div>
      <div class="message-text">${this.linkify(message.text)}</div>
    `;

     // Add click handler for clickable senders
    if (canClickSender) {
      const clickableSender = messageEl.querySelector('.clickable-sender');
      if (clickableSender) {
        clickableSender.addEventListener('click', () => {
          this.selectParticipant(clickableSender.dataset.senderId);
        });
      }
    }
    
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
    if (this.sending) return; // prevent spam
    this.sending = true;

    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) {
      this.showNotification('Please enter a message', 'warning');
      this.sending=false;
      return;
    }
    
    let recipient = 'host'; // Default for participants
    if (this.uiPermissions.canSelectRecipients) {
      const recipientSelect = document.getElementById('recipientSelect');
      recipient = recipientSelect ? recipientSelect.value : 'all';
    }
    
    try {
      await apiClient.sendMessage(message, recipient);
      input.value = '';
      input.focus();
    } catch (error) {
      this.showNotification('Failed to send message', 'error');
    } finally {
      this.sending=false;
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
      if (select) {
        select.innerHTML = '<option value="all">All Participants</option>';
        participants.forEach(participant => {
          select.innerHTML += `<option value="${participant.id}">${participant.name}</option>`;
        });
      }
    });
  }

  showNotification(message, type) {
    streamPlayer.showNotification(message, type);
  }
}

const chatManager = new ChatManager();