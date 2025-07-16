/**
 * UI Helper Functions
 * Reusable utility functions for the frontend
 */

// DOM Manipulation Helpers
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Create element with attributes and children
const createElement = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.substring(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  
  // Add children
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });
  
  return element;
};

// Show/Hide elements
const show = (element) => {
  if (typeof element === 'string') element = $(element);
  if (element) element.style.display = '';
};

const hide = (element) => {
  if (typeof element === 'string') element = $(element);
  if (element) element.style.display = 'none';
};

// Notification System
class NotificationManager {
  static show(message, type = 'info', duration = 4000) {
    const notification = createElement('div', {
      className: `notification ${type} show`,
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999'
      }
    }, [
      createElement('i', {
        className: this.getIconClass(type)
      }),
      createElement('span', {}, [' ' + message])
    ]);
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
    
    return notification;
  }
  
  static getIconClass(type) {
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
  }
  
  static success(message, duration) {
    return this.show(message, 'success', duration);
  }
  
  static error(message, duration) {
    return this.show(message, 'error', duration);
  }
  
  static warning(message, duration) {
    return this.show(message, 'warning', duration);
  }
  
  static info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Form Helpers
const getFormData = (formElement) => {
  const formData = new FormData(formElement);
  const data = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }
  return data;
};

const resetForm = (formElement) => {
  formElement.reset();
  // Clear any custom error states
  formElement.querySelectorAll('.error').forEach(el => {
    el.classList.remove('error');
  });
};

// Validation Helpers
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePhone = (phone) => {
  const re = /^\+[1-9]\d{1,14}$/;
  return re.test(phone);
};

const validateName = (name) => {
  return name.length >= 2 && name.length <= 50 && /^[a-zA-Z\s]+$/.test(name);
};

// Sanitization Helpers
const sanitizeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

// URL Helpers
const getQueryParam = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};

const updateQueryParam = (param, value) => {
  const url = new URL(window.location);
  if (value === null || value === undefined) {
    url.searchParams.delete(param);
  } else {
    url.searchParams.set(param, value);
  }
  window.history.replaceState({}, '', url);
};

// Storage Helpers
const storage = {
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Storage remove error:', e);
      return false;
    }
  },
  
  clear: () => {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.error('Storage clear error:', e);
      return false;
    }
  }
};

// Session Storage Helpers
const session = {
  get: (key) => {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Session get error:', e);
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Session set error:', e);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Session remove error:', e);
      return false;
    }
  },
  
  clear: () => {
    try {
      sessionStorage.clear();
      return true;
    } catch (e) {
      console.error('Session clear error:', e);
      return false;
    }
  }
};

// Debounce function for performance
const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle function for performance
const throttle = (func, limit = 300) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Format date/time
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
};

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};

// Copy to clipboard
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (err) {
      document.body.removeChild(textArea);
      return false;
    }
  }
};

// Network status
const isOnline = () => navigator.onLine;

const onNetworkChange = (callback) => {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
};

// Export all helpers
// export {
//   $,
//   $$,
//   createElement,
//   show,
//   hide,
//   NotificationManager,
//   getFormData,
//   resetForm,
//   validateEmail,
//   validatePhone,
//   validateName,
//   sanitizeHtml,
//   sanitizeInput,
//   getQueryParam,
//   updateQueryParam,
//   storage,
//   session,
//   debounce,
//   throttle,
//   formatTime,
//   formatDate,
//   formatRelativeTime,
//   copyToClipboard,
//   isOnline,
//   onNetworkChange
// };

window.helpers = {
  $, $$, createElement, show, hide, NotificationManager,
  getFormData, resetForm, validateEmail, validatePhone, validateName,
  sanitizeHtml, sanitizeInput, getQueryParam, updateQueryParam,
  storage, session, debounce, throttle, formatTime, formatDate,
  formatRelativeTime, copyToClipboard, isOnline, onNetworkChange
};