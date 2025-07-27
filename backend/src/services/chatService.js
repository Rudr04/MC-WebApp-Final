const { db } = require('../config/firebase');
const { logger } = require('../utils/logger');

class ChatService {
  async sendMessage(user, text, recipient = 'all') {
    const sender = `${user.role}:${user.name}`;
    const senderId = user.email || user.phone;

    const message = {
      from: sender,
      fromId: senderId,
      to: recipient,
      text: text.trim(),
      timestamp: Date.now()
    };

    await db.ref('messages').push(message);
    
    logger.info(`Message sent from ${sender} to ${recipient}`);
  }

  async getParticipants() {
    const snapshot = await db.ref('users').once('value');
    const participants = [];
    
    snapshot.forEach(child => {
      const data = child.val();
      if (data.role === 'participant') {
        participants.push({
          id: child.key,
          name: data.name,
        });
      }
      else if (data.role === 'host' || data.role === 'co-host') {
        hosts.push({
          id: child.key,
          name: data.name,
          role: data.role
        });
      }
    });

    return { participants, hosts};
  }
}

module.exports = new ChatService();