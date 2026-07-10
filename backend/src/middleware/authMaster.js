'use strict';

const crypto = require('crypto');
const supabase = require('../config/supabase');

/**
 * authenticateMasterApiKey
 * Used for auto-provisioning endpoints (/api/v1/integration/...)
 * Header: x-api-key: <raw_master_key>
 */
const authenticateMasterApiKey = async (req, res, next) => {
  const rawKey = req.headers['x-api-key'];

  if (!rawKey) {
    return res.status(401).json({
      success: false,
      error: 'Master API key diperlukan. Sertakan header x-api-key.',
    });
  }

  // Hash key to compare with the one stored in the DB
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const { data, error } = await supabase
    .from('integration_api_keys')
    .select('id, source, name, is_active')
    .eq('master_key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return res.status(401).json({
      success: false,
      error: 'Master API key tidak valid atau sudah dinonaktifkan.',
    });
  }

  req.integrationSource = data.source; // e.g., 'photobooth'
  req.integrationName = data.name;
  next();
};

module.exports = { authenticateMasterApiKey };
