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
        .select('id, session_name, status, phone_number, webhook_url, created_at, updated_at')
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
        .select('id, name, status, phone_number, webhook_url, created_at, updated_at')
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

  return router;
};
