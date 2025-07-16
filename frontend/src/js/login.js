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
    sessionStorage.setItem('user', JSON.stringify(result.user));
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
  const nameInput = document.getElementById('participantName');
  const phoneInput = document.getElementById('phone');
  const name = window.helpers.sanitizeInput(nameInput.value);
  const phone = window.helpers.sanitizeInput(phoneInput.value);
  
  // Validation
  if (!window.helpers.validateName(name)) {
    showAlert('Please enter a valid name (2-50 characters, letters only)', 'error');
    return nameInput.focus();
  }
  
  if (!window.helpers.validatePhone(phone)) {
    showAlert('Please enter a valid phone number in international format', 'error');
    return phoneInput.focus();
  }
  
  setLoading('participantJoinBtn', 'participantBtnText', true, ' Processing...', 'Join Now');
  
  try {
    const result = await authManager.loginParticipant(name, phone);
    showAlert('Authorization successful! Joining session...', 'success');
    sessionStorage.setItem('user', JSON.stringify(result.user));
    setTimeout(() => window.location.href = 'webinar.html', 1000);
  } catch (error) {
    const errorMessages = {
      'not authorized': 'This phone number is not authorized. Please contact the administrator.',
      'already in use': 'This phone number is already in use in another session.',
      'No active session': 'No active session found. Please wait for a host to start.'
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

document.getElementById('participantName').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
});

document.getElementById('participantName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('phone').focus();
});

document.getElementById('phone').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('participantJoinBtn').click();
});