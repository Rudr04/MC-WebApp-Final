module.exports = {
  // Heartbeat intervals by user state
  INTERVALS: {
    ACTIVE: 180000,          // 3 minutes
    IDLE: 300000,           // 5 minutes
    BACKGROUND: 600000      // 10 minutes
  },
  
  // Timeouts (2.5x interval)
  TIMEOUTS: {
    ACTIVE: 450000,         // 7.5 minutes
    IDLE: 750000,           // 12.5 minutes
    BACKGROUND: 1800000     // 30 minutes
  },
  
  // System settings
  JITTER_RANGE: 30000,      // ±30 seconds randomization
  INITIAL_DELAY_MAX: 60000, // Max 60s initial delay
  STATE_CHECK_INTERVAL: 60000, // Check state every minute
  
  // Backend monitoring
  MONITOR_INTERVAL: 300000,  // Check sessions every 5 minutes
  BATCH_SIZE: 100,          // Process 100 sessions per batch
  BATCH_DELAY: 1000         // 1s between batches
};