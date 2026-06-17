'use strict';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const supabase      = require('../config/supabase');
const env           = require('../config/env');
const webhookService = require('./webhookService');
const aiReplyService = require('./aiReplyService');

// Map sessionId → Client instance
// Dipertahankan selama proses server hidup
const sessions = new Map();
const qrCache   = new Map();

// ============================================================
// PUPPETEER CONFIG
// ============================================================

const getPuppeteerArgs = () => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-software-rasterizer',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--memory-pressure-off',
    '--disable-crash-reporter',
    '--disable-crashpad',
    '--headless=new',
  ];

  const opts = {
    args,
    headless:      'new',
    handleSIGINT:  false,
    handleSIGTERM: false,
    handleSIGHUP:  false,
  };

  if (env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = env.PUPPETEER_EXECUTABLE_PATH;
  }

  return opts;
};

// ============================================================
// DATABASE HELPERS
// ============================================================

/**
 * Update status sesi di tabel sessions.
 * Kolom yang ada: status, phone_number, updated_at
 */
const updateSessionStatus = async (sessionId, status, extras = {}) => {
  const { error } = await supabase
    .from('sessions')
    .update({ status, ...extras })
    .eq('id', sessionId);

  if (error) {
    console.error(`[SessionManager] Gagal update status ${sessionId}:`, error.message);
  }
};

/**
 * Simpan log pesan masuk ke tabel message_logs.
 * Schema: session_id, wa_message_id, direction, phone_number, type, status, payload
 */
const logIncomingMessage = async (sessionId, msg) => {
  // Build richer payload for media messages
  const payload = {
    text:      msg.body    || null,
    hasMedia:  msg.hasMedia || false,
    timestamp: msg.timestamp,
  };

  if (msg.hasMedia) {
    payload.mimetype  = msg.mimetype  || null;
    payload.filename  = msg.filename  || null;
    payload.mediaKey  = msg.mediaKey  || null;
  }

  const { data, error } = await supabase.from('message_logs').insert({
    session_id:    sessionId,
    wa_message_id: msg.id?.id    || null,
    direction:     'inbound',
    phone_number:  msg.from,
    type:          msg.type === 'chat' ? 'text' : (msg.type || 'text'),
    status:        'received',
    payload,
  }).select('id').single();

  if (error) {
    console.error(`[SessionManager] Gagal log pesan masuk:`, error.message);
    return null;
  }

  return data?.id;
};

// ============================================================
// SESSION LIFECYCLE
// ============================================================

/**
 * Buat instance WhatsApp client baru untuk sessionId tertentu.
 * Semua event langsung di-wire ke Socket.io room session:${sessionId}
 *
 * @param {string} sessionId  - UUID sesi dari tabel sessions
 * @param {object} io         - Socket.io Server instance
 */

const MAX_RETRY  = 3;
const RETRY_DELAY_MS = 5000;


const createSession = (sessionId, io, retryCount = 0) => {
  if (sessions.has(sessionId)) {
    console.log(`[SessionManager] Session ${sessionId} sudah ada, skip create`);
    return sessions.get(sessionId);
  }

  console.log(`[SessionManager] Membuat sesi: ${sessionId} (attempt ${retryCount + 1})`);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId:  sessionId,
      dataPath:  env.WA_SESSION_PATH,
    }),
    puppeteer: getPuppeteerArgs(),
    // Gunakan versi WA Web yang lebih stabil via remote cache
    webVersionCache: {
      type: 'local',
    },
  });

  // ----------------------------------------------------------
  // EVENT: QR Code diterima
  // ----------------------------------------------------------
  client.on('qr', async (qr) => {
    console.log(`[SessionManager] QR diterima untuk: ${sessionId}`);
    await updateSessionStatus(sessionId, 'authenticating');
    qrCache.set(sessionId, qr);
    io.to(`session:${sessionId}`).emit('qr', { session_id: sessionId, qr_string: qr });
  });

  // ----------------------------------------------------------
  // EVENT: Autentikasi berhasil (sebelum ready)
  // ----------------------------------------------------------
  client.on('authenticated', async () => {
    console.log(`[SessionManager] Authenticated: ${sessionId}`);
    await updateSessionStatus(sessionId, 'authenticating');
    io.to(`session:${sessionId}`).emit('authenticated', { session_id: sessionId });
  });

  // ----------------------------------------------------------
  // EVENT: Client siap digunakan
  // ----------------------------------------------------------
  client.on('ready', async () => {
    qrCache.delete(sessionId);
    console.log(`[SessionManager] Ready: ${sessionId}`);
    const phoneNumber = client.info?.wid?.user || null;
    await updateSessionStatus(sessionId, 'connected', {
      phone_number: phoneNumber,
    });
    io.to(`session:${sessionId}`).emit('ready', {
      session_id:   sessionId,
      phone_number: phoneNumber,
    });
  });

  // ----------------------------------------------------------
  // EVENT: Autentikasi gagal
  // ----------------------------------------------------------
  client.on('auth_failure', async (msg) => {
    qrCache.delete(sessionId); //
    console.error(`[SessionManager] Auth failure: ${sessionId}`, msg);
    await updateSessionStatus(sessionId, 'disconnected');
    io.to(`session:${sessionId}`).emit('auth_failure', {
      session_id: sessionId,
      message:    msg,
    });
    sessions.delete(sessionId);
  });

  // ----------------------------------------------------------
  // EVENT: Sesi terputus
  // ----------------------------------------------------------
  client.on('disconnected', async (reason) => {
    qrCache.delete(sessionId); //
    console.log(`[SessionManager] Disconnected: ${sessionId}, reason: ${reason}`);
    await updateSessionStatus(sessionId, 'disconnected');
    io.to(`session:${sessionId}`).emit('disconnected', {
      session_id: sessionId,
      reason,
    });
    sessions.delete(sessionId);
  });

  // ----------------------------------------------------------
  // EVENT: Pesan masuk
  // ----------------------------------------------------------
  client.on('message', async (msg) => {
    
    // Abaikan pesan broadcast/status WhatsApp
    if (msg.from === 'status@broadcast') return;

    console.log(`[SessionManager] Pesan masuk di ${sessionId} dari ${msg.from}`);

    // Simpan ke DB
    const messageLogId = await logIncomingMessage(sessionId, msg);

    // Emit ke dashboard
    io.to(`session:${sessionId}`).emit('message', {
      session_id: sessionId,
      from:       msg.from,
      body:       msg.body,
      type:       msg.type,
      timestamp:  msg.timestamp,
    });

    // Kirim ke webhook pengguna (jika ada)
    if (!messageLogId) return;

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('webhook_url')
      .eq('id', sessionId)
      .single();

    if (sessionData?.webhook_url) {
      const webhookPayload = {
        event:      'message.received',
        session_id: sessionId,
        timestamp:  new Date().toISOString(),
        data: {
          id:       msg.id?.id,
          from:     msg.from,
          to:       msg.to,
          body:     msg.body,
          type:     msg.type,
          hasMedia: msg.hasMedia,
        },
      };

      // Fire-and-forget — jangan block event loop
      webhookService
        .deliver(messageLogId, sessionData.webhook_url, webhookPayload)
        .catch(console.error);
    }

    aiReplyService
    .handleIncomingMessage(sessionId, msg, client)
    .catch(console.error);
  });

  sessions.set(sessionId, client);

  // Inisialisasi client (launch Chromium)
  client.initialize().catch(async (err) => {
    console.error(`[SessionManager] initialize() gagal untuk ${sessionId}:`, err.message);
    sessions.delete(sessionId);
    if (retryCount < MAX_RETRY) {
      console.log(
        `[SessionManager] Retry sesi ${sessionId} dalam ${RETRY_DELAY_MS / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      createSession(sessionId, io, retryCount + 1);
    } else {
      console.error(`[SessionManager] Sesi ${sessionId} gagal setelah ${MAX_RETRY} percobaan.`);
      await updateSessionStatus(sessionId, 'disconnected').catch(console.error);
      io.to(`session:${sessionId}`).emit('error', {
        session_id: sessionId,
        message:    'Gagal menginisialisasi sesi setelah beberapa percobaan.',
      });
    }
  });

  return client;
};

// ============================================================
// DELETE SESSION
// ============================================================

/**
 * Logout dan hancurkan client WhatsApp untuk sessionId tertentu.
 * Gunakan ini hanya saat user SENGAJA menghapus/disconnect sesi.
 * Memanggil logout() akan menghapus sesi dari WhatsApp — QR scan ulang diperlukan.
 */
const deleteSession = async (sessionId) => {
  const client = sessions.get(sessionId);

  if (!client) {
    console.log(`[SessionManager] Tidak ada client aktif untuk session: ${sessionId}`);
    return;
  }

  try {
    await client.logout();
  } catch (err) {
    // Bisa terjadi jika sudah disconnect sebelumnya
    console.warn(`[SessionManager] logout() error untuk ${sessionId}:`, err.message);
  }

  try {
    await client.destroy();
  } catch (err) {
    console.warn(`[SessionManager] destroy() error untuk ${sessionId}:`, err.message);
  }

  await aiReplyService.clearAllHistoriesBySession(sessionId);
  sessions.delete(sessionId);
  console.log(`[SessionManager] Sesi dihapus (logout): ${sessionId}`);
};

// ============================================================
// DESTROY SESSION (Graceful Shutdown — TANPA logout)
// ============================================================

/**
 * Hancurkan Puppeteer client TANPA logout dari WhatsApp.
 * Gunakan ini saat server shutdown/restart/redeploy agar
 * session data di volume tetap valid — tidak perlu QR scan ulang.
 */
const destroySession = async (sessionId) => {
  const client = sessions.get(sessionId);

  if (!client) return;

  try {
    await client.destroy();
  } catch (err) {
    console.warn(`[SessionManager] destroy() error untuk ${sessionId}:`, err.message);
  }

  sessions.delete(sessionId);
  console.log(`[SessionManager] Sesi di-destroy (tanpa logout): ${sessionId}`);
};

// ============================================================
// GETTERS
// ============================================================

/** Ambil client aktif berdasarkan sessionId */
const getSession = (sessionId) => sessions.get(sessionId) || null;

/** Dapatkan daftar semua sessionId yang sedang aktif di Map */
const getAllSessions = () => [...sessions.keys()];

// ============================================================
// RESTORE ON SERVER RESTART
// ============================================================

/**
 * Saat server restart, ambil sesi yang statusnya masih aktif
 * dari Supabase dan re-inisialisasi client-nya.
 * (LocalAuth akan membaca session yang sudah tersimpan di volume)
 */
const restoreActiveSessions = async (io) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .in('status', ['connected', 'authenticating']);

  if (error) {
    console.error('[SessionManager] Gagal fetch sesi untuk restore:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('[SessionManager] Tidak ada sesi yang perlu di-restore.');
    return;
  }

  console.log(`[SessionManager] Restoring ${data.length} sesi...`);

  for (const session of data) {
    createSession(session.id, io);
    // Jeda 2 detik antar-sesi agar tidak overload Chromium
    await new Promise((r) => setTimeout(r, 2000));
  }
};

const getCachedQr = (sessionId) => qrCache.get(sessionId) || null;

module.exports = {
  createSession,
  deleteSession,
  destroySession,
  getSession,
  getAllSessions,
  getCachedQr, 
  restoreActiveSessions,
};
