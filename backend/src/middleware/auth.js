'use strict';

const crypto  = require('crypto');
const supabase = require('../config/supabase');

// ============================================================
// authenticateApiKey
// Dipakai untuk endpoint eksternal (/api/v1/...)
// Header: x-api-key: <raw_key>
// ============================================================
const authenticateApiKey = async (req, res, next) => {
  const rawKey = req.headers['x-api-key'];

  if (!rawKey) {
    return res.status(401).json({
      success: false,
      error: 'API key diperlukan. Sertakan header x-api-key.',
    });
  }

  // Hash key untuk dibandingkan dengan yang tersimpan di DB
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, label, is_active')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return res.status(401).json({
      success: false,
      error: 'API key tidak valid atau sudah dinonaktifkan.',
    });
  }

  // Update timestamp penggunaan terakhir (fire-and-forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then()
    .catch(console.error);

  req.apiKey = data;
  req.userId = data.user_id;
  next();
};

// ============================================================
// authenticateJWT
// Dipakai untuk endpoint internal dashboard (/api/internal/...)
// Header: Authorization: Bearer <supabase_jwt>
// ============================================================
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Header Authorization tidak valid. Format: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      success: false,
      error: 'Token tidak valid atau sudah kedaluwarsa.',
    });
  }

  req.user   = user;
  req.userId = user.id;
  next();
};

module.exports = { authenticateApiKey, authenticateJWT };
