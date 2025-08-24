/**
 * Custom Confirm Modal - Matches webinar app UI design
 * Replaces browser confirm() dialogs with styled modals
 */
class ConfirmModal {
  constructor(options = {}) {
    this.type = options.type || 'simple'; // 'simple' | 'countdown'
    this.title = options.title || 'Confirm Action';
    this.message = options.message || 'Are you sure?';
    this.confirmText = options.confirmText || 'Confirm';
    this.cancelText = options.cancelText || 'Cancel';
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.countdownSeconds = options.countdownSeconds || 3;
    this.icon = options.icon || '';
    
    this.modal = null;
    this.isDestroyed = false;
    this.countdownTimer = null;
    this.countdownRemaining = this.countdownSeconds;
    
    this.create();
    this.bindEvents();
    this.show();
    
    if (this.type === 'countdown') {
      this.startCountdown();
    }
  }

  create() {
    // Create modal overlay
    this.modal = document.createElement('div');
    this.modal.className = 'confirm-modal-overlay';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'confirm-modal-title');
    
    // Create modal content
    const modalCard = document.createElement('div');
    modalCard.className = 'confirm-modal-card';
    
    // Title with icon
    const titleElement = document.createElement('div');
    titleElement.className = 'confirm-modal-title';
    titleElement.id = 'confirm-modal-title';
    titleElement.innerHTML = `${this.icon} ${this.title}`;
    
    // Divider
    const divider = document.createElement('div');
    divider.className = 'confirm-modal-divider';
    
    // Message
    const messageElement = document.createElement('div');
    messageElement.className = 'confirm-modal-message';
    messageElement.textContent = this.message;
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'confirm-modal-buttons';
    
    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'confirm-modal-btn confirm-modal-btn-cancel';
    cancelButton.textContent = this.cancelText;
    cancelButton.setAttribute('data-action', 'cancel');
    
    // Confirm button
    this.confirmButton = document.createElement('button');
    this.confirmButton.className = 'confirm-modal-btn confirm-modal-btn-confirm';
    this.confirmButton.setAttribute('data-action', 'confirm');
    
    // Set initial confirm button state
    if (this.type === 'countdown') {
      this.confirmButton.disabled = true;
      this.confirmButton.textContent = `${this.confirmText} (${this.countdownRemaining}s)`;
    } else {
      this.confirmButton.textContent = this.confirmText;
    }
    
    // Assemble modal
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(this.confirmButton);
    
    modalCard.appendChild(titleElement);
    modalCard.appendChild(divider);
    modalCard.appendChild(messageElement);
    modalCard.appendChild(buttonContainer);
    
    this.modal.appendChild(modalCard);
    document.body.appendChild(this.modal);
    
    // Focus trap elements
    this.focusableElements = modalCard.querySelectorAll('button');
    this.firstFocusable = this.focusableElements[0];
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
  }

  bindEvents() {
    // Button clicks
    this.modal.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'cancel') {
        this.cancel();
      } else if (e.target.dataset.action === 'confirm') {
        this.confirm();
      } else if (e.target === this.modal) {
        // Click outside modal
        this.cancel();
      }
    });
    
    // Keyboard events
    this.handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.cancel();
      } else if (e.key === 'Tab') {
        this.handleTabKey(e);
      }
    };
    
    document.addEventListener('keydown', this.handleKeydown);
  }

  handleTabKey(e) {
    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === this.firstFocusable) {
        e.preventDefault();
        this.lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusable) {
        e.preventDefault();
        this.firstFocusable.focus();
      }
    }
  }

  startCountdown() {
    this.countdownTimer = setInterval(() => {
      this.countdownRemaining--;
      
      if (this.countdownRemaining > 0) {
        this.confirmButton.textContent = `${this.confirmText} (${this.countdownRemaining}s)`;
      } else {
        // Countdown finished
        this.confirmButton.disabled = false;
        this.confirmButton.textContent = this.confirmText;
        this.confirmButton.classList.add('confirm-modal-btn-ready');
        clearInterval(this.countdownTimer);
      }
    }, 1000);
  }

  show() {
    // Force reflow
    this.modal.offsetHeight;
    
    // Add show class for animation
    this.modal.classList.add('confirm-modal-show');
    
    // Focus the first button
    setTimeout(() => {
      this.firstFocusable.focus();
    }, 100);
  }

  confirm() {
    if (this.isDestroyed) return;
    
    // Don't allow confirm if countdown is still active
    if (this.type === 'countdown' && this.confirmButton.disabled) {
      return;
    }
    
    this.onConfirm();
    this.destroy();
  }

  cancel() {
    if (this.isDestroyed) return;
    
    this.onCancel();
    this.destroy();
  }

  destroy() {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    
    // Clear countdown timer
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeydown);
    
    // Remove modal with animation
    this.modal.classList.remove('confirm-modal-show');
    this.modal.classList.add('confirm-modal-hide');
    
    setTimeout(() => {
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
    }, 300);
  }

  // Static method to create simple confirm modal
  static confirm(message, options = {}) {
    return new Promise((resolve) => {
      new ConfirmModal({
        title: options.title || 'Confirm Action',
        message: message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        icon: options.icon || '❓',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  // Static method to create countdown confirm modal
  static countdownConfirm(message, options = {}) {
    return new Promise((resolve) => {
      new ConfirmModal({
        type: 'countdown',
        title: options.title || '⚠️ Confirm Action',
        message: message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        countdownSeconds: options.countdownSeconds || 3,
        icon: options.icon || '⚠️',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }
}

// Export for use in other modules
window.ConfirmModal = ConfirmModal;