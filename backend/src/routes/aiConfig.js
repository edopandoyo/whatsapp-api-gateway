'use strict';

const express        = require('express');
const supabase       = require('../config/supabase');
const aiReplyService = require('../services/aiReplyService');

const router = express.Router({ mergeParams: true }); // mergeParams untuk akses :sessionId dari parent

// ============================================================
// HELPERS
// ============================================================

/**
 * Verifikasi bahwa sesi milik user yang sedang login.
 * Return data sesi atau null.
 */
const getOwnedSession = async (sessionId, userId) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
};

const DEFAULT_CONFIG = {
  is_enabled: false,
  context:    '',
  ollama_url: 'http://localhost:11434',
  model:      'qwen2.5:7b',
  max_tokens: 500,
};

// ============================================================
// GET /sessions/:sessionId/ai-config
// Ambil konfigurasi AI untuk sesi tertentu.
// Jika belum ada, kembalikan nilai default.
// ============================================================
router.get('/', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId        = req.userId;

    const session = await getOwnedSession(sessionId, userId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
    }

    const { data, error } = await supabase
      .from('ai_configs')
      .select('id, is_enabled, context, ollama_url, model, max_tokens, created_at, fallback_message, provider, groq_api_key, updated_at')
      .eq('session_id', sessionId)
      .single();

    // PGRST116 = row not found → kembalikan default, bukan error
    if (error && error.code === 'PGRST116') {
      return res.json({ success: true, data: DEFAULT_CONFIG });
    }

    if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /sessions/:sessionId/ai-config
// Buat atau update (upsert) konfigurasi AI sesi.
// Body: { context, ollama_url, model, max_tokens }
// Toggle is_enabled TIDAK dilakukan di sini, gunakan endpoint /toggle.
// ============================================================
router.post('/', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId        = req.userId;

    const session = await getOwnedSession(sessionId, userId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
    }

    const {
      context    = '',
      ollama_url = DEFAULT_CONFIG.ollama_url,
      model      = DEFAULT_CONFIG.model,
      max_tokens = DEFAULT_CONFIG.max_tokens,
      fallback_message = 'Maaf, saya sedang tidak bisa memproses pesan Anda saat ini.',
      provider   = 'ollama',
      groq_api_key = '',
    } = req.body;

    // Validasi sederhana
    if (!ollama_url || typeof ollama_url !== 'string') {
      return res.status(400).json({ success: false, error: 'Field "ollama_url" wajib diisi.' });
    }

    const parsedMaxTokens = parseInt(max_tokens, 10);
    if (isNaN(parsedMaxTokens) || parsedMaxTokens < 100 || parsedMaxTokens > 4000) {
      return res.status(400).json({ success: false, error: 'max_tokens harus antara 100 – 4000.' });
    }

    const { data, error } = await supabase
      .from('ai_configs')
      .upsert(
        {
          session_id: sessionId,
          context:    context.trim(),
          ollama_url: ollama_url.trim(),
          model:      (model || DEFAULT_CONFIG.model).trim(),
          max_tokens: parsedMaxTokens,
          fallback_message: fallback_message.trim(),
          provider: provider,
          groq_api_key:    groq_api_key.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' }
      )
      .select('id, is_enabled, context, ollama_url, model, max_tokens, fallback_message, provider, groq_api_key, updated_at')
      .single();

    if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /sessions/:sessionId/ai-config/toggle
// Aktifkan atau nonaktifkan AI Auto Reply.
// Body: { is_enabled: boolean }
// ============================================================
router.patch('/toggle', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId        = req.userId;

    const session = await getOwnedSession(sessionId, userId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
    }

    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Field "is_enabled" wajib bertipe boolean.',
      });
    }

    // Cek apakah config sudah ada
    const { data: existing, error: fetchError } = await supabase
      .from('ai_configs')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    // Jika belum ada config sama sekali, buat dulu dengan default value
    if (fetchError && fetchError.code === 'PGRST116') {
      const { data: created, error: createError } = await supabase
        .from('ai_configs')
        .insert({
          session_id: sessionId,
          is_enabled,
          ...DEFAULT_CONFIG,
          is_enabled, // override default
        })
        .select('id, is_enabled, context, ollama_url, model, max_tokens')
        .single();

      if (createError) throw Object.assign(new Error(createError.message), { statusCode: 500 });

      return res.json({
        success: true,
        data:    created,
        message: `AI Auto Reply ${is_enabled ? 'diaktifkan' : 'dinonaktifkan'}.`,
      });
    }

    if (fetchError) throw Object.assign(new Error(fetchError.message), { statusCode: 500 });

    // Update is_enabled saja
    const { data, error } = await supabase
      .from('ai_configs')
      .update({ is_enabled, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .select('id, is_enabled, context, ollama_url, model, max_tokens')
      .single();

    if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });

    res.json({
      success: true,
      data,
      message: `AI Auto Reply ${is_enabled ? 'diaktifkan' : 'dinonaktifkan'}.`,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /sessions/:sessionId/ai-history
// Hapus semua riwayat percakapan AI untuk sesi ini.
// Berguna untuk reset konteks dari dashboard.
// ============================================================
router.delete('/history', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId        = req.userId;

    const session = await getOwnedSession(sessionId, userId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
    }

    await aiReplyService.clearAllHistoriesBySession(sessionId);

    res.json({ success: true, message: 'Semua riwayat AI berhasil dihapus.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;