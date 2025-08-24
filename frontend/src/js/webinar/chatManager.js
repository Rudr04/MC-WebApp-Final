class ChatManager {
  constructor() {
    this.firestore = null;
    this.database = null; // Keep RTDB for users/sessions
    this.messagesQuery = null;
    this.unsubscribeMessages = null;
    this.currentUser = null;
    this.uiPermissions = null;
    this.sending = null;
    this.participantsMap = new Map();
  }

  async initialize(user, uiPermissions = {}) {
    this.currentUser = user;
    this.uiPermissions = uiPermissions;
    
    // Initialize Firebase services
    this.firestore = firebase.firestore();
    this.database = firebase.database(); // Keep for users/sessions
  
    // Check if Firebase is authenticated
    if (!firebaseAuthManager.isAuthenticated) {
      console.warn('Firebase not authenticated, chat features may be limited');
    }
    
    // Load participants if user has recipient selection permissions
    if (this.uiPermissions.canSelectRecipients) {
      console.log('Loading participants list for recipient selection...');
      await this.loadParticipantsList(); // Wait for participants data
      console.log('Participants list loaded and map populated');
      // Check if recipientSelector exists (might be injected after this call)
      const recipientSelector = document.getElementById('recipientSelector');
      if (recipientSelector) {
        recipientSelector.style.display = 'block';
      }
    }
    
    // Set up listeners (after participants are loaded)
    console.log('Setting up chat message listener...');
    this.setupMessageListener();
    console.log('message listener setup complete');
    this.updateParticipantCount(); // Still uses RTDB
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
    // Clean up existing listener
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
    }

    const messagesRef = this.firestore.collection('messages');
    let query;

    try {
      if (this.currentUser.role === 'participant') {
        // Try optimized query first - will fail if index doesn't exist
        const userIdentifier = this.currentUser.phone;
        query = messagesRef
          .where('visibility', 'array-contains-any', ['all', userIdentifier])
          .orderBy('timestamp', 'asc');
        
        console.log(`Using optimized Firestore query for participant: ${userIdentifier}`);
      } else {
        // Hosts see all messages
        query = messagesRef.orderBy('timestamp', 'asc');
        console.log(`Using basic query for host/co-host: ${this.currentUser.name}`);
      }

      // Listen for real-time updates
      this.unsubscribeMessages = query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const message = change.doc.data();
            this.displayMessage(message);
          }
        });
      }, (error) => {
        console.error('Optimized query failed, falling back to basic query + client filtering');
        console.error('Error:', error.message);
        
        // Fallback to basic query with client-side filtering
        this.setupBasicMessageListener();
      });

    } catch (error) {
      console.error('Query setup failed, using fallback:', error);
      this.setupBasicMessageListener();
    }
  }

  setupBasicMessageListener() {
    const messagesRef = this.firestore.collection('messages');
    const query = messagesRef.orderBy('timestamp', 'asc');

    console.log(`Using basic query with client-side filtering for ${this.currentUser.role}`);

    this.unsubscribeMessages = query.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const message = change.doc.data();
          
          // Apply client-side filtering for participants
          if (this.currentUser.role === 'participant') {
            const userIdentifier = this.currentUser.phone;
            const shouldShow = message.visibility.includes('all') || 
                              message.visibility.includes(userIdentifier);
            if (!shouldShow) return;
          }
          
          this.displayMessage(message);
        }
      });
    }, (error) => {
      console.error('Error listening to messages:', error);
      this.showNotification('Chat connection error. Please refresh.', 'error');
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
    const isPrivate = message.to !== 'all' && message.to !== 'host';
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
      : `<i class="fas fa-${isHost ? 'crown' : 'user'} style="cursor: text;"></i> ${senderName}`;

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
    // Use activeUsers/counts/participants for better performance
    const activeParticipantCountRef = this.database.ref('activeUsers/counts/participants');
    
    activeParticipantCountRef.on('value', (snapshot) => {
      const count = snapshot.val() || 0;
      console.log('Active participant count:', count);
      document.getElementById('participantNumber').textContent = count;
    });
  }

  async loadParticipantsList() {
    return new Promise((resolve) => {
      // Keep using RTDB for user data
      const participantsRef = this.database.ref('users').orderByChild('role').equalTo('participant');
      
      participantsRef.once('value', (snapshot) => {
        const participants = [];
        // Clear and repopulate participants map
        this.participantsMap.clear();
        
        snapshot.forEach(child => {
          const data = child.val();
          const participant = {
            id: child.key,
            name: data.name,
          };
          participants.push(participant);
          
          // Populate the participants map for name lookup
          this.participantsMap.set(participant.id, participant.name);
        });
        
        console.log('Participants map updated:', this.participantsMap);
        
        const select = document.getElementById('recipientSelect');
        if (select) {
          select.innerHTML = '<option value="all">All Participants</option>';
          participants.forEach(participant => {
            select.innerHTML += `<option value="${participant.id}">${participant.name}</option>`;
          });
        }
        
        // Set up continuous listener for updates after initial load
        participantsRef.on('value', (snapshot) => {
          const participants = [];
          this.participantsMap.clear();
          
          snapshot.forEach(child => {
            const data = child.val();
            const participant = {
              id: child.key,
              name: data.name,
            };
            participants.push(participant);
            this.participantsMap.set(participant.id, participant.name);
          });
          
          const select = document.getElementById('recipientSelect');
          if (select) {
            select.innerHTML = '<option value="all">All Participants</option>';
            participants.forEach(participant => {
              select.innerHTML += `<option value="${participant.id}">${participant.name}</option>`;
            });
          }
        });
        
        resolve();
      });
    });
  }

  // Cleanup method for Firestore listener
  cleanup() {
    console.log('Cleaning up chat manager listeners...');
    
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
      this.unsubscribeMessages = null;
    }
    
    console.log('Chat manager cleanup completed');
  }

  showNotification(message, type) {
    streamPlayer.showNotification(message, type);
  }
}

const chatManager = new ChatManager();