'use strict';

const express = require('express');
const QRCode = require('qrcode');
const sessionManager = require('../services/sessionManager');
const supabase = require('../config/supabase');

const router = express.Router();

module.exports = (io) => {

  // Helper: Map database session row to SDK SessionData structure
  const mapSessionRow = (row) => ({
    id: row.id,
    name: row.session_name,
    status: row.status,
    phoneNumber: row.phone_number || undefined,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
  });

  // ============================================================
  // POST /
  // Create a new WhatsApp session
  // Body: { name, webhook_url, vendorId, integrationSource }
  // ============================================================
  router.post('/', async (req, res, next) => {
    try {
      const { name, webhook_url, vendorId, integrationSource } = req.body;
      const userId = req.userId;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Field "name" wajib diisi.',
        });
      }

      // Save session to DB first
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: userId,
          session_name: name.trim(),
          status: 'pending',
          webhook_url: webhook_url || null,
          vendor_id: vendorId || null,
          integration_source: integrationSource || 'direct',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Create WhatsApp client instance with the database UUID
      sessionManager.createSession(data.id, io);

      res.status(201).json({
        success: true,
        data: mapSessionRow(data),
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // GET /
  // List all sessions for the authenticated user
  // ============================================================
  router.get('/', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_name, status, phone_number, user_id, webhook_url, created_at, updated_at')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        data: data.map(mapSessionRow),
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // GET /:sessionId
  // Get detailed session data
  // ============================================================
  router.get('/:sessionId', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_name, status, phone_number, user_id, webhook_url, created_at, updated_at')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      const isActive = sessionManager.getSession(sessionId) !== null;

      res.json({
        success: true,
        data: {
          ...mapSessionRow(data),
          processAlive: isActive,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // DELETE /:sessionId
  // Disconnect and delete session
  // ============================================================
  router.delete('/:sessionId', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      // Verify ownership
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      // Destroy WhatsApp client
      await sessionManager.deleteSession(sessionId);

      // Remove from DB
      const { error: deleteError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (deleteError) {
        throw deleteError;
      }

      res.json({ success: true, message: 'Sesi berhasil dihapus.' });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // GET /:sessionId/status
  // Get session connection status (lightweight polling endpoint)
  // ============================================================
  router.get('/:sessionId/status', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      const { data, error } = await supabase
        .from('sessions')
        .select('id, status, phone_number, last_connected_at')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      res.json({
        success: true,
        data: {
          sessionId: data.id,
          status: data.status,
          phoneNumber: data.phone_number || undefined,
          connectedAt: data.last_connected_at || undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // GET /:sessionId/qr
  // Get WhatsApp QR code as base64 image data URL
  // ============================================================
  router.get('/:sessionId/qr', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      const { data, error } = await supabase
        .from('sessions')
        .select('id, status, user_id')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      if (data.status === 'connected') {
        return res.status(400).json({
          success: false,
          error: 'Sesi sudah terhubung. QR Code tidak tersedia.',
          code: 'QR_NOT_AVAILABLE',
        });
      }

      const qrText = sessionManager.getCachedQr(sessionId);
      if (!qrText) {
        return res.status(400).json({
          success: false,
          error: 'QR Code is not available yet.',
          code: 'QR_NOT_AVAILABLE',
        });
      }

      // Convert raw QR text into base64 image data URL
      const qrDataUrl = await QRCode.toDataURL(qrText);
      const expiresAt = new Date(Date.now() + 60000).toISOString(); // QR code standard 60s expiration

      res.json({
        success: true,
        data: {
          sessionId,
          qrCode: qrDataUrl,
          expiresAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // POST /:sessionId/reconnect
  // Trigger reconnection for disconnected session
  // ============================================================
  router.post('/:sessionId/reconnect', async (req, res, next) => {
    try {
      const { sessionId } = req.params;

      // Verify ownership
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (sessionError || !session) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      // If active, delete old client first
      if (sessionManager.getSession(sessionId)) {
        await sessionManager.deleteSession(sessionId);
      }

      // Re-create session
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
