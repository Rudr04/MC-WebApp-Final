const { body, param, query, validationResult } = require('express-validator');
const { VALIDATION, MESSAGES, HTTP_STATUS } = require('../config/constants');

// Custom validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: MESSAGES.ERROR.INVALID_INPUT,
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Sanitization helpers
const sanitizeInput = (value) => {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/[<>]/g, '');
};

const sanitizePhone = (value) => {
  if (!value) return value;
  // Remove all non-digit characters except +
  let cleaned = value.replace(/[^\d+]/g, '');
  // Ensure it starts with +
  if (cleaned && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
};

// Validation rules
const validationRules = {
  // Auth validations
  participantLogin: [
    body('phone')
      .customSanitizer(sanitizePhone)
      .matches(VALIDATION.PHONE_REGEX)
      .withMessage('Please enter a valid international phone number (e.g., +919876543210)'),
  ],
  
  // Message validations
  sendMessage: [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message cannot be empty')
      .isLength({ max: VALIDATION.MESSAGE_MAX_LENGTH })
      .withMessage(`Message cannot exceed ${VALIDATION.MESSAGE_MAX_LENGTH} characters`)
      .customSanitizer(sanitizeInput),
    
    body('to')
      .optional()
      .isString()
      .withMessage('Recipient must be a string')
      .customSanitizer(sanitizeInput)
  ],
  
  // ID validations
  validateId: [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Invalid ID')
      .customSanitizer(sanitizeInput)
  ],
  
  // Query validations
  paginationQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ]
};

// Custom validators
const customValidators = {
  isValidRole: (value) => {
    const validRoles = ['host', 'co-host', 'participant'];
    return validRoles.includes(value);
  },
  
  isValidPhoneNumber: (value) => {
    return VALIDATION.PHONE_REGEX.test(value);
  },
  
  isValidName: (value) => {
    return VALIDATION.NAME_REGEX.test(value) && 
           value.length >= VALIDATION.NAME_MIN_LENGTH && 
           value.length <= VALIDATION.NAME_MAX_LENGTH;
  }
};

// Export validation middleware combinations
module.exports = {
  validate,
  validationRules,
  customValidators,
  sanitizeInput,
  sanitizePhone,
  
  // Commonly used validation chains
  validateParticipantLogin: [...validationRules.participantLogin, validate],
  validateSendMessage: [...validationRules.sendMessage, validate],
  validateId: [...validationRules.validateId, validate],
  validatePagination: [...validationRules.paginationQuery, validate]
};
