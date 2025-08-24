const { db, firestore } = require('../config/firebase');
const { logger } = require('../utils/logger');
const { FIREBASE_PATHS } = require('../config/constants');

class ChatService {
  async sendMessage(user, text, recipient = 'all') {
    const sender = `${user.role}:${user.name}`;
    const senderId = user.email || user.phone;

    // Calculate visibility array for Firestore
    let visibility = [];
    if (recipient === 'all') {
      visibility = ['all'];
    } else {
      // Private message: visible to sender and recipient
      visibility = [senderId, recipient];
    }

    const message = {
      from: sender,
      fromId: senderId,
      to: recipient,
      text: text.trim(),
      timestamp: Date.now(),
      visibility: visibility
    };

    // Write to Firestore instead of RTDB
    await firestore.collection('messages').add(message);
    
    logger.info(`Message sent from ${sender} to ${recipient} with visibility: [${visibility.join(', ')}]`);
  }

  async getParticipants() {
    logger.debug('Getting active participants list');
    
    // Use indexed query to get only active participants
    const snapshot = await db.ref('users')
      .orderByChild('role')
      .equalTo('participant')
      .once('value');

    const participants = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data && data.name) {
        participants.push({
          id: child.key,
          name: data.name,
          phone: data.phone
        });
      }
    });

    logger.debug(`Found ${participants.length} participants`);
    return participants;
  }
}

module.exports = new ChatService();