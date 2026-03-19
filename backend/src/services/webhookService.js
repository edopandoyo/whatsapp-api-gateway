'use strict';

const axios    = require('axios');
const supabase = require('../config/supabase');

const MAX_RETRIES    = 3;
const RETRY_DELAYS   = [1000, 5000, 15000]; // 1s, 5s, 15s (exponential-ish)

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Catat hasil pengiriman webhook ke tabel webhook_deliveries.
 * Schema referensi → webhook_deliveries: message_log_id, webhook_url,
 *   response_status, attempt_number, is_success, error_message, delivered_at
 *
 * @param {Object} opts
 */
const logDelivery = async ({
  messageLogId,
  webhookUrl,
  responseStatus,
  attemptNumber,
  isSuccess,
  errorMessage,
}) => {
  const { error } = await supabase.from('webhook_deliveries').insert({
    message_log_id:  messageLogId,
    webhook_url:     webhookUrl,
    response_status: responseStatus   || null,
    attempt_number:  attemptNumber,
    is_success:      isSuccess,
    error_message:   errorMessage     || null,
  });

  if (error) {
    console.error('[WebhookService] Gagal simpan log delivery:', error.message);
  }
};

// ---------------------------------------------------------------------------
// DELIVER
// ---------------------------------------------------------------------------

/**
 * Kirim webhook payload ke URL tujuan dengan retry logic.
 *
 * @param {string} messageLogId  - UUID message_log yang memicu webhook
 * @param {string} webhookUrl    - URL endpoint pengguna
 * @param {Object} payload       - Payload JSON yang akan dikirim
 * @returns {Promise<{success: boolean, statusCode?: number, attempts: number, error?: string}>}
 */
const deliver = async (messageLogId, webhookUrl, payload) => {
  let lastError  = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type':       'application/json',
          'X-WebWA-Event':      payload.event   || 'webhook',
          'X-WebWA-SessionId':  payload.session_id || '',
          'X-WebWA-Attempt':    String(attempt),
        },
        timeout:        10_000,  // 10 detik per percobaan
        validateStatus: (status) => status >= 200 && status < 300,
      });

      lastStatus = response.status;

      // Catat sukses
      await logDelivery({
        messageLogId,
        webhookUrl,
        responseStatus: response.status,
        attemptNumber:  attempt,
        isSuccess:      true,
      });

      console.log(`[WebhookService] ✓ Delivered ke ${webhookUrl} (attempt ${attempt})`);
      return { success: true, statusCode: response.status, attempts: attempt };

    } catch (err) {
      lastError  = err;
      lastStatus = err.response?.status || null;

      console.warn(
        `[WebhookService] ✗ Attempt ${attempt}/${MAX_RETRIES} gagal untuk ${webhookUrl}: ${err.message}`
      );

      // Delay sebelum retry (kecuali attempt terakhir)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt - 1]);
      }
    }
  }

  // Semua retry gagal — catat kegagalan
  await logDelivery({
    messageLogId,
    webhookUrl,
    responseStatus: lastStatus,
    attemptNumber:  MAX_RETRIES,
    isSuccess:      false,
    errorMessage:   lastError?.message,
  });

  console.error(
    `[WebhookService] ✗ Semua ${MAX_RETRIES} attempt gagal untuk ${webhookUrl}`
  );

  return {
    success:  false,
    error:    lastError?.message,
    attempts: MAX_RETRIES,
  };
};

module.exports = { deliver };
