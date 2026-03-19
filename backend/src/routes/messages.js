'use strict';

const express        = require('express');
const sessionManager = require('../services/sessionManager');
const supabase       = require('../config/supabase');
const { MessageMedia } = require('whatsapp-web.js');
const { formatPhoneNumber, isValidPhoneNumber } = require('../utils/phoneNumber');

const router = express.Router();

// ============================================================
// Helper: Ambil client aktif dan verifikasi kepemilikan sesi
// ============================================================
const getAuthorizedClient = async (sessionId, userId, res) => {
  // Verifikasi sesi ada dan milik userId
  const { data: sessionData, error } = await supabase
    .from('sessions')
    .select('id, status, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !sessionData) {
    res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
    return null;
  }

  if (sessionData.status !== 'connected') {
    res.status(409).json({
      success: false,
      error:   `Sesi belum terhubung. Status saat ini: ${sessionData.status}`,
    });
    return null;
  }

  const client = sessionManager.getSession(sessionId);
  if (!client) {
    res.status(409).json({
      success: false,
      error:   'Client WhatsApp tidak aktif di memori. Silakan reconnect.',
    });
    return null;
  }

  return client;
};

// ============================================================
// Helper: Simpan log pesan keluar ke message_logs
// ============================================================
const logOutboundMessage = async ({
  sessionId,
  to,
  type,
  status,
  payload,
  waMessageId,
}) => {
  const { data, error } = await supabase.from('message_logs').insert({
    session_id:    sessionId,
    wa_message_id: waMessageId   || null,
    direction:     'outbound',
    phone_number:  to,
    type,
    status,
    payload,
  }).select('id').single();

  if (error) {
    console.error('[Messages] Gagal log outbound:', error.message);
    return null;
  }

  return data?.id;
};

// ============================================================
// FACTORY — inject io, kembalikan router
// ============================================================
module.exports = (io) => {

  // ----------------------------------------------------------
  // POST /sessions/:sessionId/messages/text
  // Kirim pesan teks
  // Body: { to: string, text: string }
  // ----------------------------------------------------------
  router.post('/:sessionId/messages/text', async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { to, text }  = req.body;

      if (!to || !text) {
        return res.status(400).json({
          success: false,
          error:   'Field "to" dan "text" wajib diisi.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error:   'Nomor telepon tidak valid.',
        });
      }

      const client = await getAuthorizedClient(sessionId, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);

      // Kirim pesan
      const msg = await client.sendMessage(chatId, text);

      // Log ke DB
      await logOutboundMessage({
        sessionId,
        to:         chatId,
        type:       'text',
        status:     'sent',
        payload:    { text },
        waMessageId: msg?.id?.id,
      });

      res.json({
        success: true,
        data: {
          id:   msg?.id?.id,
          to:   chatId,
          type: 'text',
        },
      });
    } catch (err) {
      // Coba log kegagalan
      try {
        await logOutboundMessage({
          sessionId: req.params.sessionId,
          to:        req.body?.to,
          type:      'text',
          status:    'failed',
          payload:   { text: req.body?.text, error: err.message },
        });
      } catch (_) {}

      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /sessions/:sessionId/messages/media
  // Kirim pesan media (image/pdf/dll dari URL atau base64)
  // Body: { to, mediaUrl?, base64?, mimetype, filename?, caption? }
  // ----------------------------------------------------------
  router.post('/:sessionId/messages/media', async (req, res, next) => {
    try {
      const { sessionId }                                    = req.params;
      const { to, mediaUrl, base64, mimetype, filename, caption } = req.body;

      if (!to || (!mediaUrl && !base64) || !mimetype) {
        return res.status(400).json({
          success: false,
          error:   '"to", ("mediaUrl" atau "base64"), dan "mimetype" wajib diisi.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error:   'Nomor telepon tidak valid.',
        });
      }

      const client = await getAuthorizedClient(sessionId, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);

      // Buat MessageMedia dari URL atau base64
      let media;
      if (mediaUrl) {
        media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      } else {
        media = new MessageMedia(mimetype, base64, filename || 'file');
      }

      const msg = await client.sendMessage(chatId, media, {
        caption: caption || '',
      });

      await logOutboundMessage({
        sessionId,
        to:          chatId,
        type:        'media',
        status:      'sent',
        payload:     { mediaUrl, mimetype, filename, caption },
        waMessageId: msg?.id?.id,
      });

      res.json({
        success: true,
        data: { id: msg?.id?.id, to: chatId, type: 'media' },
      });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /sessions/:sessionId/messages/bulk
  // Kirim pesan ke beberapa nomor sekaligus (maks 100)
  // Body: { messages: [{ to, text }] }
  // ----------------------------------------------------------
  router.post('/:sessionId/messages/bulk', async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { messages }  = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error:   '"messages" harus berupa array yang tidak kosong.',
        });
      }

      if (messages.length > 100) {
        return res.status(400).json({
          success: false,
          error:   'Maksimum 100 pesan per request bulk.',
        });
      }

      const client = await getAuthorizedClient(sessionId, req.userId, res);
      if (!client) return;

      const results  = [];
      const DELAY_MS = 1200; // 1.2 detik antar pesan — hindari spam-detect

      for (const item of messages) {
        const { to, text } = item;

        if (!to || !text || !isValidPhoneNumber(to)) {
          results.push({ to, status: 'skipped', error: 'to / text tidak valid' });
          continue;
        }

        const chatId = formatPhoneNumber(to);

        try {
          const msg = await client.sendMessage(chatId, text);

          await logOutboundMessage({
            sessionId,
            to: chatId,
            type: 'text',
            status: 'sent',
            payload: { text },
            waMessageId: msg?.id?.id,
          });

          results.push({ to: chatId, status: 'sent', id: msg?.id?.id });
        } catch (sendErr) {
          await logOutboundMessage({
            sessionId,
            to: chatId,
            type: 'text',
            status: 'failed',
            payload: { text, error: sendErr.message },
          });

          results.push({ to: chatId, status: 'failed', error: sendErr.message });
        }

        // Delay antar pesan
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      res.json({ success: true, data: { total: messages.length, results } });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // GET /sessions/:sessionId/messages
  // Ambil log pesan (paginasi cursor-based)
  // Query: ?limit=50&offset=0&direction=inbound|outbound
  // ----------------------------------------------------------
  router.get('/:sessionId/messages', async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const limit         = Math.min(parseInt(req.query.limit  || '50', 10), 200);
      const offset        = parseInt(req.query.offset || '0', 10);
      const direction     = req.query.direction; // optional filter

      // Verifikasi kepemilikan sesi
      const { data: sessionCheck } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.userId)
        .single();

      if (!sessionCheck) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      let query = supabase
        .from('message_logs')
        .select('*', { count: 'exact' })
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (direction === 'inbound' || direction === 'outbound') {
        query = query.eq('direction', direction);
      }

      const { data, error, count } = await query;

      if (error) {
        throw Object.assign(new Error(error.message), { statusCode: 500 });
      }

      res.json({
        success: true,
        data,
        meta: { total: count, limit, offset },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
