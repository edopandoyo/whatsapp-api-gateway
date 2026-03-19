'use strict';

const express  = require('express');
const crypto   = require('crypto');
const supabase = require('../config/supabase');

const router = express.Router();

// ============================================================
// GET /api-keys
// Daftar API key milik user
// ============================================================
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, is_active, last_used_at, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api-keys
// Buat API key baru
// Body: { label: string }
// ============================================================
router.post('/', async (req, res, next) => {
  try {
    const { label } = req.body;

    if (!label || typeof label !== 'string' || label.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error:   'Field "label" wajib diisi.',
      });
    }

    // Generate random 32-byte key, encode hex → "wa_" prefix
    const rawKey  = 'wa_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id:  req.userId,
        label:    label.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
      })
      .select('id, label, is_active, created_at')
      .single();

    if (error) throw new Error(error.message);

    // Kembalikan raw key HANYA sekali ini — setelah ini tidak bisa dilihat lagi
    res.status(201).json({
      success: true,
      data: {
        ...data,
        // Satu-satunya kesempatan user melihat raw key
        api_key: rawKey,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /api-keys/:keyId
// Nonaktifkan (soft-delete) API key
// ============================================================
router.delete('/:keyId', async (req, res, next) => {
  try {
    const { keyId } = req.params;

    const { data, error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', req.userId)
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'API key tidak ditemukan.' });
    }

    res.json({ success: true, message: 'API key berhasil dinonaktifkan.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
