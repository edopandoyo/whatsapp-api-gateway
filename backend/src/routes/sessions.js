'use strict';

const express        = require('express');
const sessionManager = require('../services/sessionManager');
const supabase       = require('../config/supabase');

const router = express.Router();

// ============================================================
// GET /health
// Public endpoint — tidak perlu auth
// ============================================================
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    status:  'ok',
    uptime:  process.uptime(),
    ts:      new Date().toISOString(),
    activeSessions: sessionManager.getAllSessions().length,
  });
});

// ============================================================
// INJEKSI io INSTANCE via middleware closure
// Fungsi ini dibungkus supaya bisa akses Socket.io server
// ============================================================
module.exports = (io) => {

  // ----------------------------------------------------------
  // POST /sessions
  // Buat sesi WhatsApp baru
  // Body JSON: { name: string }
  // ----------------------------------------------------------
  router.post('/', async (req, res, next) => {
    try {
      const { name, webhook_url } = req.body;
      const userId = req.userId;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error:   'Field "name" wajib diisi.',
        });
      }

      // Simpan sesi ke DB terlebih dahulu untuk mendapatkan UUID
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id:     userId,
          session_name:        name.trim(),
          status:      'pending',
          webhook_url: webhook_url || null,
        })
        .select()
        .single();

      if (error) {
        throw Object.assign(new Error(error.message), { statusCode: 500 });
      }

      // Buat WA client dengan UUID dari DB sebagai session ID
      sessionManager.createSession(data.id, io);

      res.status(201).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // GET /sessions
  // Ambil daftar sesi milik user yang sedang login
  // ----------------------------------------------------------
  router.get('/', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_name, status, phone_number, webhook_url, last_connected_at, created_at, updated_at')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw Object.assign(new Error(error.message), { statusCode: 500 });
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // GET /sessions/:sessionId
  // Detail satu sesi
  // ----------------------------------------------------------
  router.get('/:sessionId', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_name, status, phone_number, webhook_url, last_connected_at, created_at, updated_at')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      const isActive = sessionManager.getSession(sessionId) !== null;

      res.json({ success: true, data: { ...data, process_alive: isActive } });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // PATCH /sessions/:sessionId
  // Update nama / webhook_url sesi
  // ----------------------------------------------------------
  router.patch('/:sessionId', async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { name, webhook_url } = req.body;

      const updates = {};
      if (name        !== undefined) updates.name        = name.trim();
      if (webhook_url !== undefined) updates.webhook_url = webhook_url;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error:   'Tidak ada field yang diupdate.',
        });
      }

      const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .select()
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // DELETE /sessions/:sessionId
  // Logout & hapus instance WA + data DB
  // ----------------------------------------------------------
  router.delete('/:sessionId', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      // Verifikasi kepemilikan
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      // Destroy WA client
      await sessionManager.deleteSession(sessionId);

      // Hapus dari DB
      await supabase.from('sessions').delete().eq('id', sessionId);

      res.json({ success: true, message: 'Sesi berhasil dihapus.' });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /sessions/:sessionId/reconnect
  // Re-inisialisasi sesi yang terputus
  // ----------------------------------------------------------
  router.post('/:sessionId/reconnect', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      // Verifikasi kepemilikan
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      // Jika ada instance lama, hapus terlebih dahulu
      if (sessionManager.getSession(sessionId)) {
        await sessionManager.deleteSession(sessionId);
      }

      // Buat ulang
      sessionManager.createSession(sessionId, io);

      await supabase
        .from('sessions')
        .update({ status: 'pending' })
        .eq('id', sessionId);

      res.json({ success: true, message: 'Proses reconnect dimulai.' });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /sessions/:sessionId/test-webhook
  // Kirim payload dummy ke webhook_url sesi untuk keperluan testing
  // ----------------------------------------------------------
  router.post('/:sessionId/test-webhook', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      // Verifikasi kepemilikan dan ambil webhook_url
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, webhook_url, status')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      if (!session.webhook_url) {
        return res.status(400).json({
          success: false,
          error: 'Sesi ini belum memiliki webhook_url. Set webhook_url terlebih dahulu via PATCH /sessions/:id.',
        });
      }

      // Payload dummy yang menyerupai pesan masuk nyata
      const testPayload = {
        event:      'message.received',
        session_id: sessionId,
        timestamp:  new Date().toISOString(),
        test:       true,
        data: {
          id:       'TEST_MESSAGE_ID',
          from:     '628000000000@c.us',
          to:       '628111111111@c.us',
          body:     '👋 Ini adalah test webhook dari WebWA Gateway.',
          type:     'chat',
          hasMedia: false,
        },
      };

      const axios = require('axios');

      try {
        const response = await axios.post(session.webhook_url, testPayload, {
          headers: {
            'Content-Type':      'application/json',
            'X-WebWA-Event':     'message.received',
            'X-WebWA-SessionId': sessionId,
            'X-WebWA-Attempt':   '1',
            'X-WebWA-Test':      'true',
          },
          timeout: 10_000,
          validateStatus: (s) => s >= 200 && s < 300,
        });

        return res.json({
          success:     true,
          message:     'Test webhook berhasil dikirim.',
          webhook_url: session.webhook_url,
          status_code: response.status,
          payload_sent: testPayload,
        });
      } catch (deliveryErr) {
        return res.status(502).json({
          success:     false,
          error:       `Webhook endpoint gagal merespons: ${deliveryErr.message}`,
          webhook_url: session.webhook_url,
          status_code: deliveryErr.response?.status || null,
          payload_sent: testPayload,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
};

