'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const rateLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,  // default: 60 detik
  max:             env.RATE_LIMIT_MAX,         // default: 60 request/window
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Terlalu banyak request. Silakan coba lagi nanti.',
  },
  skip: (req) => req.path === '/health',
});

module.exports = { rateLimiter };
