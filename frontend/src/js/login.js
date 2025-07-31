function showAlert(message, type = 'error') {
  const alertContainer = document.getElementById('alertContainer');
  alertContainer.innerHTML = `<div class="alert ${type}" style="display: block">${message}</div>`;
  setTimeout(() => alertContainer.innerHTML = '', 5000);
}

function setLoading(btnId, textId, loading, loadingText, defaultText) {
  const btn = document.getElementById(btnId);
  const textEl = document.getElementById(textId);
  btn.disabled = loading;
  textEl.innerHTML = loading ? `<span class="loading"></span>${loadingText || ''}` : defaultText;
}

// Initialize auth manager
authManager.initialize().catch(error => {
  showAlert('Failed to initialize. Please refresh the page.', 'error');
});

// Host Login Handler
document.getElementById('hostLoginBtn').addEventListener('click', async () => {
  setLoading('hostLoginBtn', 'hostBtnText', true, '', 'Host Login');
  
  try {
    const result = await authManager.loginWithGoogle();
    showAlert('Login successful! Redirecting...', 'success');
    // User data will be retrieved from JWT token in webinar.js
    setTimeout(() => window.location.href = 'webinar.html', 1000);
  } catch (error) {
    const errorMessages = {
      'Access denied': 'Access denied: You are not registered as an authorized host',
      'auth/popup-closed-by-user': 'Login cancelled',
      'auth/popup-blocked': 'Popup blocked. Please allow popups for this site'
    };
    
    const errorMessage = Object.keys(errorMessages).find(key => 
      error.message?.includes(key) || error.code === key
    );
    
    showAlert(errorMessages[errorMessage] || 'Login failed. Please try again.', 'error');
    setLoading('hostLoginBtn', 'hostBtnText', false, '', 'Host Login');
  }
});

// Participant Login Handler
document.getElementById('participantJoinBtn').addEventListener('click', async () => {
  const phoneInput = document.getElementById('phone');
  const phone = window.helpers.sanitizeInput(phoneInput.value);
  
  // Validation
  if (!window.helpers.validatePhone(phone)) {
    showAlert('Please enter a valid phone number in international format', 'error');
    return phoneInput.focus();
  }
  
  setLoading('participantJoinBtn', 'participantBtnText', true, ' Processing...', 'Join Now');
  
  try {
    const result = await authManager.loginParticipant(phone);
    showAlert('Authorization successful! Joining session...', 'success');
    // User data will be retrieved from JWT token in webinar.js
    setTimeout(() => window.location.href = 'webinar.html', 1000);
  } catch (error) {
    const errorMessages = {
      'not authorized': 'This phone number is not registered. Please contact the administrator.',
      'already in use': 'This phone number is already in use in another session.',
      'No active session': 'No active session found. Please wait for a host to start.',
      'Name not found': 'Your registration data is incomplete. Please contact the administrator.'
    };
    
    const errorMessage = Object.keys(errorMessages).find(key => error.message?.includes(key));
    showAlert(errorMessages[errorMessage] || 'Failed to join session. Please try again.', 'error');
    setLoading('participantJoinBtn', 'participantBtnText', false, '', 'Join Now');
  }
});

// Input formatting and navigation
document.getElementById('phone').addEventListener('input', (e) => {
  let value = e.target.value.replace(/[^\d+]/g, '');
  e.target.value = value && !value.startsWith('+') ? '+' + value : value;
});

document.getElementById('phone').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('participantJoinBtn').click();
});