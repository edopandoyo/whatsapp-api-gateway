'use strict';

/**
 * messagesExternal.js
 * Router untuk External API (/api/v1/messages/*)
 *
 * Berbeda dengan messagesInternal: sessionId dibaca dari req.body,
 * bukan dari URL parameter — sehingga endpoint lebih bersih untuk
 * integrasi pihak ketiga.
 *
 * Auth: x-api-key header (authenticateApiKey)
 */

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
  if (!sessionId) {
    res.status(400).json({ success: false, error: 'Field "session_id" wajib diisi.' });
    return null;
  }

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
// Helper: Log pesan keluar ke message_logs
// ============================================================
const logOutboundMessage = async ({ sessionId, to, type, status, payload, waMessageId }) => {
  const { data, error } = await supabase.from('message_logs').insert({
    session_id:    sessionId,
    wa_message_id: waMessageId || null,
    direction:     'outbound',
    phone_number:  to,
    type,
    status,
    payload,
  }).select('id').single();

  if (error) console.error('[Messages] Gagal log outbound:', error.message);
  return data?.id;
};

// ============================================================
// Helper: Memetakan error WhatsApp agar lebih mudah dipahami
// ============================================================
const handleWhatsAppError = (err) => {
  if (!err) return err;

  // Jika error karena nomor tidak terdaftar atau tidak valid di WA
  if (err.message && err.message.includes('No LID for user')) {
    err.message = 'Nomor tujuan tidak terdaftar di WhatsApp.';
    err.statusCode = 400;
  }

  return err;
};

// ============================================================
// FACTORY — inject io, kembalikan router
// ============================================================
module.exports = (io) => {

  // ----------------------------------------------------------
  // POST /messages/text
  // Kirim pesan teks
  // Body: { session_id, to, text }
  // ----------------------------------------------------------
  router.post('/text', async (req, res, next) => {
    try {
      const { session_id, to, text } = req.body;

      if (!to || !text) {
        return res.status(400).json({
          success: false,
          error:   'Field "session_id", "to", dan "text" wajib diisi.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error:   'Nomor telepon tidak valid. Gunakan format: 628xxx',
        });
      }

      const client = await getAuthorizedClient(session_id, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);
      const msg    = await client.sendMessage(chatId, text);

      await logOutboundMessage({
        sessionId:   session_id,
        to:          chatId,
        type:        'text',
        status:      'sent',
        payload:     { text },
        waMessageId: msg?.id?.id,
      });

      res.json({
        success: true,
        data: { id: msg?.id?.id, to: chatId, type: 'text' },
      });
    } catch (err) {
      handleWhatsAppError(err);
      try {
        await logOutboundMessage({
          sessionId: req.body?.session_id,
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
  // POST /messages/send-text (SDK Compatible)
  // Kirim pesan teks
  // Body: { sessionId, to, message }
  // ----------------------------------------------------------
  router.post('/send-text', async (req, res, next) => {
    try {
      const sessionId = req.body.sessionId || req.body.session_id;
      const to = req.body.to;
      const message = req.body.message || req.body.text;

      if (!sessionId || !to || !message) {
        return res.status(400).json({
          success: false,
          error: 'Field "sessionId", "to", dan "message" wajib diisi.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error: 'Nomor telepon tidak valid. Gunakan format: 628xxx',
        });
      }

      const client = await getAuthorizedClient(sessionId, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);
      const msg = await client.sendMessage(chatId, message);

      await logOutboundMessage({
        sessionId:   sessionId,
        to:          chatId,
        type:        'text',
        status:      'sent',
        payload:     { text: message },
        waMessageId: msg?.id?.id,
      });

      res.json({
        success: true,
        data: { id: msg?.id?.id, to: chatId, type: 'text', success: true, status: 'sent' },
      });
    } catch (err) {
      handleWhatsAppError(err);
      try {
        await logOutboundMessage({
          sessionId: req.body?.sessionId || req.body?.session_id,
          to:        req.body?.to,
          type:      'text',
          status:    'failed',
          payload:   { text: req.body?.message || req.body?.text, error: err.message },
        });
      } catch (_) {}
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /messages/media
  // Kirim pesan media (image/pdf/dll dari URL atau base64)
  // Body: { session_id, to, mediaUrl?, base64?, mimetype, filename?, caption? }
  // ----------------------------------------------------------
  router.post('/media', async (req, res, next) => {
    try {
      const { session_id, to, mediaUrl, base64, mimetype, filename, caption } = req.body;

      if (!to || (!mediaUrl && !base64) || !mimetype) {
        return res.status(400).json({
          success: false,
          error:   '"session_id", "to", ("mediaUrl" atau "base64"), dan "mimetype" wajib diisi.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error:   'Nomor telepon tidak valid. Gunakan format: 628xxx',
        });
      }

      const client = await getAuthorizedClient(session_id, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);

      let media;
      if (mediaUrl) {
        media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      } else {
        media = new MessageMedia(mimetype, base64, filename || 'file');
      }

      const msg = await client.sendMessage(chatId, media, { caption: caption || '' });

      await logOutboundMessage({
        sessionId:   session_id,
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
      handleWhatsAppError(err);
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /messages/send-media (SDK Compatible)
  // Kirim pesan media (image/pdf/dll dari URL atau base64)
  // Body: { sessionId, to, mediaType, mediaUrl?, mediaBase64?, caption?, filename?, mimeType? }
  // ----------------------------------------------------------
  router.post('/send-media', async (req, res, next) => {
    try {
      const sessionId = req.body.sessionId || req.body.session_id;
      const to = req.body.to;
      const mediaType = req.body.mediaType || req.body.media_type || 'media';
      const mediaUrl = req.body.mediaUrl || req.body.media_url;
      const mediaBase64 = req.body.mediaBase64 || req.body.media_base64 || req.body.base64;
      const caption = req.body.caption;
      const filename = req.body.filename;
      const mimeType = req.body.mimeType || req.body.mime_type || req.body.mimetype;

      if (!sessionId || !to) {
        return res.status(400).json({
          success: false,
          error: 'Field "sessionId" dan "to" wajib diisi.',
        });
      }

      if (!mediaUrl && !mediaBase64) {
        return res.status(400).json({
          success: false,
          error: 'Salah satu dari "mediaUrl" atau "mediaBase64" wajib diisi.',
        });
      }

      if (!mediaUrl && !mimeType) {
        return res.status(400).json({
          success: false,
          error: 'Field "mimeType" wajib diisi jika mengirim media base64.',
        });
      }

      if (!isValidPhoneNumber(to)) {
        return res.status(400).json({
          success: false,
          error: 'Nomor telepon tidak valid. Gunakan format: 628xxx',
        });
      }

      const client = await getAuthorizedClient(sessionId, req.userId, res);
      if (!client) return;

      const chatId = formatPhoneNumber(to);

      let media;
      if (mediaUrl) {
        media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      } else {
        media = new MessageMedia(mimeType, mediaBase64, filename || 'file');
      }

      const msg = await client.sendMessage(chatId, media, { caption: caption || '' });

      await logOutboundMessage({
        sessionId:   sessionId,
        to:          chatId,
        type:        mediaType,
        status:      'sent',
        payload:     { mediaUrl, mimetype: mimeType || media.mimetype, filename, caption },
        waMessageId: msg?.id?.id,
      });

      res.json({
        success: true,
        data: { id: msg?.id?.id, to: chatId, type: mediaType, success: true, status: 'sent' },
      });
    } catch (err) {
      handleWhatsAppError(err);
      next(err);
    }
  });

  // ----------------------------------------------------------
  // POST /messages/bulk
  // Kirim pesan ke beberapa nomor sekaligus (maks 100)
  // Body: { session_id, messages: [{ to, text }] }
  // ----------------------------------------------------------
  router.post('/bulk', async (req, res, next) => {
    try {
      const { session_id, messages } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error:   '"session_id" dan "messages" (array tidak kosong) wajib diisi.',
        });
      }

      if (messages.length > 100) {
        return res.status(400).json({
          success: false,
          error:   'Maksimum 100 pesan per request bulk.',
        });
      }

      const client = await getAuthorizedClient(session_id, req.userId, res);
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
            sessionId:   session_id,
            to:          chatId,
            type:        'text',
            status:      'sent',
            payload:     { text },
            waMessageId: msg?.id?.id,
          });

          results.push({ to: chatId, status: 'sent', id: msg?.id?.id });
        } catch (sendErr) {
          handleWhatsAppError(sendErr);
          await logOutboundMessage({
            sessionId: session_id,
            to:        chatId,
            type:      'text',
            status:    'failed',
            payload:   { text, error: sendErr.message },
          });

          results.push({ to: chatId, status: 'failed', error: sendErr.message });
        }

        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      res.json({ success: true, data: { total: messages.length, results } });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------
  // GET /messages
  // Ambil log pesan (paginasi)
  // Query: ?session_id=&limit=50&offset=0&direction=inbound|outbound
  // ----------------------------------------------------------
  router.get('/', async (req, res, next) => {
    try {
      const session_id = req.query.session_id;
      const limit      = Math.min(parseInt(req.query.limit  || '50', 10), 200);
      const offset     = parseInt(req.query.offset || '0', 10);
      const direction  = req.query.direction;

      if (!session_id) {
        return res.status(400).json({ success: false, error: 'Query "session_id" wajib diisi.' });
      }

      // Verifikasi kepemilikan
      const { data: sessionCheck } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .eq('user_id', req.userId)
        .single();

      if (!sessionCheck) {
        return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
      }

      let query = supabase
        .from('message_logs')
        .select('*', { count: 'exact' })
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (direction === 'inbound' || direction === 'outbound') {
        query = query.eq('direction', direction);
      }

      const { data, error, count } = await query;
      if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });

      res.json({ success: true, data, meta: { total: count, limit, offset } });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
