'use strict';

// Validate required environment variables
const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[ENV] Missing required environment variable: ${key}`);
  }
}

module.exports = {
  PORT:                       parseInt(process.env.PORT || '3001', 10),
  NODE_ENV:                   process.env.NODE_ENV || 'development',
  SUPABASE_URL:               process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY:  process.env.SUPABASE_SERVICE_ROLE_KEY,
  FRONTEND_URL:               process.env.FRONTEND_URL || 'http://localhost:5173',
  RATE_LIMIT_MAX:             parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  RATE_LIMIT_WINDOW_MS:       parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  WA_SESSION_PATH:            process.env.WA_SESSION_PATH || './.wwebjs_auth',
  PUPPETEER_EXECUTABLE_PATH:  process.env.PUPPETEER_EXECUTABLE_PATH || '',
};
