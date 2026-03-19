'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
require('dotenv').config();
const supabase   = require('./config/supabase');

const env            = require('./config/env');
const { morganLogger }             = require('./utils/logger');
const { rateLimiter }              = require('./middleware/rateLimiter');
const { authenticateJWT, authenticateApiKey } = require('./middleware/auth');
const { notFoundHandler, errorHandler }       = require('./middleware/errorHandler');
const sessionManager = require('./services/sessionManager');

const sessionsRouterFactory  = require('./routes/sessions');
const messagesRouterFactory  = require('./routes/messages');
const apiKeysRouter          = require('./routes/apiKeys');

// ============================================================
// EXPRESS + HTTP SERVER
// ============================================================
const app    = express();
const server = http.createServer(app);

// ============================================================
// SOCKET.IO SERVER
// ============================================================
const io = new Server(server, {
  cors: {
    origin:      env.FRONTEND_URL,
    credentials: true,
  },
});

// Socket.io middleware — validasi JWT sebelum koneksi WS
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Token tidak disertakan.'));
  }

  const { createClient } = require('@supabase/supabase-js');
  const tempClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await tempClient.auth.getUser(token);

  if (error || !user) {
    return next(new Error('Token tidak valid.'));
  }

  socket.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client terhubung: ${socket.id} (userId: ${socket.userId})`);

  // Client bergabung ke room sesi tertentu untuk menerima event real-time
  socket.on('join_session', async (sessionId) => {
    // Verifikasi bahwa sesi milik user yang terkoneksi
    const { createClient } = require('@supabase/supabase-js');
    const tempClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data } = await tempClient
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', socket.userId)
      .single();

    if (!data) {
      socket.emit('error', { message: 'Sesi tidak valid atau bukan milik Anda.' });
      return;
    }

    socket.join(`session:${sessionId}`);
    console.log(`[Socket.io] ${socket.id} bergabung ke room: session:${sessionId}`);
    socket.emit('joined', { session_id: sessionId });

    const cachedQr = sessionManager.getCachedQr(sessionId);
  if (cachedQr) {
    console.log(`[Socket.io] Re-emit cached QR untuk: ${sessionId}`);
    socket.emit('qr', {
      session_id: sessionId,
      qr_string:  cachedQr,
    });
  }
  });

  socket.on('leave_session', (sessionId) => {
    socket.leave(`session:${sessionId}`);
    console.log(`[Socket.io] ${socket.id} meninggalkan room: session:${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client terputus: ${socket.id}`);
  });
});

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================
app.use(helmet());
app.use(cors({
  origin:      env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));   // 50 MB: cover base64 media
app.use(express.urlencoded({ extended: true }));
app.use(morganLogger);

// ============================================================
// ROUTES
// ============================================================

// Health check — publik
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status:  'ok',
    uptime:  process.uptime(),
    ts:      new Date().toISOString(),
  });
});

// --- Internal API (Dashboard) — diproteksi JWT ---
const internalRouter = express.Router();
internalRouter.use(rateLimiter);
internalRouter.use(authenticateJWT);

internalRouter.get('/messages', async (req, res, next) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit   || '50', 10), 200);
    const offset    = parseInt(req.query.offset  || '0',  10);
    const direction = req.query.direction;   // opsional
    const status    = req.query.status;      // opsional
    const sessionId = req.query.session_id;  // opsional — filter satu sesi

    // Ambil semua session_id milik user ini
    const { data: userSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', req.userId);

    if (!userSessions?.length) {
      return res.json({
        success: true,
        data:    [],
        meta:    { total: 0, limit, offset },
      });
    }

    const ownedIds = userSessions.map(s => s.id);

    // Kalau ada filter session_id, pastikan itu milik user
    const targetIds = sessionId
      ? (ownedIds.includes(sessionId) ? [sessionId] : [])
      : ownedIds;

    if (targetIds.length === 0) {
      return res.status(403).json({ success: false, error: 'Sesi tidak ditemukan.' });
    }

    let query = supabase
      .from('message_logs')
      .select('*', { count: 'exact' })
      .in('session_id', targetIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction);
    }

    if (['sent', 'failed', 'received'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data,
      meta: { total: count, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

internalRouter.use('/sessions', sessionsRouterFactory(io));
internalRouter.use('/sessions', messagesRouterFactory(io));   // /:sessionId/messages/*
internalRouter.use('/api-keys', apiKeysRouter);

app.use('/api/internal', internalRouter);

// --- External API — diproteksi API Key ---
// Endpoint untuk integrasi pihak ketiga via x-api-key header
const externalRouter = express.Router();
externalRouter.use(rateLimiter);
externalRouter.use(authenticateApiKey);
externalRouter.use('/sessions', messagesRouterFactory(io));   // POST kirim pesan

app.use('/api/v1', externalRouter);

// ============================================================
// ERROR HANDLING
// ============================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================
// START SERVER
// ============================================================
server.listen(env.PORT, async () => {
  console.log(`\n🚀 Masedo Studio Backend running on port ${env.PORT}`);
  console.log(`   Environment : ${env.NODE_ENV}`);
  console.log(`   Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`   Supabase URL: ${env.SUPABASE_URL}\n`);

  // Restore sesi aktif dari DB
  await sessionManager.restoreActiveSessions(io);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n[Server] Menerima ${signal}. Memulai graceful shutdown...`);

  for (const sessionId of sessionManager.getAllSessions()) {
    console.log(`[Server] Menghancurkan sesi: ${sessionId}`);
    await sessionManager.deleteSession(sessionId).catch(console.error);
  }

  server.close(() => {
    console.log('[Server] HTTP server ditutup. Keluar.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
