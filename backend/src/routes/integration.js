'use strict';

const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { authenticateMasterApiKey } = require('../middleware/authMaster');

const router = express.Router();

// All integration endpoints require master API key authentication
router.use(authenticateMasterApiKey);

/**
 * POST /register
 * Register a vendor for auto-provisioning
 * Body: { vendorId, vendorName, email }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { vendorId, vendorName, email } = req.body;
    const source = req.integrationSource; // Set by authMaster middleware

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        error: 'Field "vendorId" wajib diisi.',
      });
    }

    // 1. Check if vendor integration already exists
    const { data: existing, error: findError } = await supabase
      .from('vendor_integrations')
      .select('id, wa_user_id, api_key_id')
      .eq('vendor_id', vendorId)
      .eq('vendor_source', source)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    let userId;
    let isNew = false;
    let oldApiKeyId = null;

    if (existing) {
      userId = existing.wa_user_id;
      oldApiKeyId = existing.api_key_id;
      console.log(`[Integration] Existing vendor found: ${source}:${vendorId} -> user ${userId}`);
    } else {
      isNew = true;
      // Generate unique email and password
      const userEmail = email || `${source}-${vendorId}@integration.masedo.my.id`;
      const password = crypto.randomBytes(16).toString('hex') + '!1Aa';
      const name = vendorName || `${source} Vendor ${vendorId.substring(0, 8)}`;

      console.log(`[Integration] Creating new user for vendor ${source}:${vendorId}...`);
      
      // Create user using Supabase Admin API
      const { data: userData, error: createUserError } = await supabase.auth.admin.createUser({
        email: userEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createUserError) {
        throw createUserError;
      }

      userId = userData.user.id;
      console.log(`[Integration] Created user: ${userId}`);
    }

    // 2. Generate a new API key for the vendor
    const rawKey = 'wa_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);
    const keyLabel = `${source} Auto-Key ${new Date().toISOString().split('T')[0]}`;

    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        label: keyLabel,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
      })
      .select('id')
      .single();

    if (apiKeyError) {
      throw apiKeyError;
    }

    // 3. Update vendor integration mapping
    if (existing) {
      const { error: updateError } = await supabase
        .from('vendor_integrations')
        .update({
          api_key_id: apiKeyData.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }

      // Deactivate the old API key to avoid accumulation of active keys
      if (oldApiKeyId) {
        await supabase
          .from('api_keys')
          .update({ is_active: false })
          .eq('id', oldApiKeyId);
      }
    } else {
      const { error: insertError } = await supabase
        .from('vendor_integrations')
        .insert({
          vendor_id: vendorId,
          vendor_source: source,
          vendor_name: vendorName || `${source} Vendor ${vendorId.substring(0, 8)}`,
          vendor_email: email || `${source}-${vendorId}@integration.masedo.my.id`,
          wa_user_id: userId,
          api_key_id: apiKeyData.id,
        });

      if (insertError) {
        throw insertError;
      }
    }

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        apiKey: rawKey,
        userId,
        isNew,
      },
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
