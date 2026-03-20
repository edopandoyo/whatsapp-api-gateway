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

// FRONTEND_URL bisa berupa satu URL atau beberapa URL dipisah koma
// Contoh: "http://localhost:5173,http://localhost:5174"
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174';
const corsOrigins    = rawFrontendUrl.split(',').map(u => u.trim()).filter(Boolean);

module.exports = {
  PORT:                       parseInt(process.env.PORT || '3001', 10),
  NODE_ENV:                   process.env.NODE_ENV || 'development',
  SUPABASE_URL:               process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY:  process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Array of allowed origins untuk CORS
  CORS_ORIGINS:               corsOrigins,
  // Tetap expose FRONTEND_URL sebagai string (untuk logging)
  FRONTEND_URL:               corsOrigins[0],
  RATE_LIMIT_MAX:             parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  RATE_LIMIT_WINDOW_MS:       parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  WA_SESSION_PATH:            process.env.WA_SESSION_PATH || './.wwebjs_auth',
  PUPPETEER_EXECUTABLE_PATH:  process.env.PUPPETEER_EXECUTABLE_PATH || '',
};
