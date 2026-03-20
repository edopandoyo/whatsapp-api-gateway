'use strict';

const supabase = require('../config/supabase');

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_OLLAMA_URL       = 'http://localhost:11434';
const DEFAULT_MODEL            = 'qwen2.5:7b';
const DEFAULT_MAX_TOKENS       = 500;
const MAX_HISTORY_LENGTH       = 20;
const AI_REPLY_DELAY_MS        = 1500;
const OLLAMA_TIMEOUT_MS        = 90_000; // 15 detik

const DEFAULT_FALLBACK_MESSAGE = 'Maaf, saya sedang tidak bisa memproses pesan Anda saat ini. Tim kami akan segera menghubungi Anda.';

// ============================================================
// HELPERS
// ============================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ambil identifier kontak untuk keperluan logging & history.
 * Tidak digunakan untuk kirim pesan (pakai msg.reply() saja).
 */
const getContactNumber = (msg) => {
  return msg.from || msg.id?.remote || 'unknown';
};

/**
 * Buat system prompt dari konteks yang diberikan user.
 */
const buildSystemPrompt = (context) => {
  const base = [
    'Kamu adalah asisten WhatsApp yang membantu dan ramah.',
    'Jawab dengan singkat, natural, dan seperti percakapan chat biasa.',
    'Jangan gunakan formatting markdown (bold, italic, bullet point, dsb).',
    'Maksimal 3 kalimat per balasan kecuali diminta detail.',
    'Jika pertanyaan di luar konteks yang kamu ketahui, jawab dengan sopan bahwa kamu tidak bisa membantu hal tersebut.',
  ].join('\n');

  if (context && context.trim().length > 0) {
    return `${base}\n\nInformasi dan konteks bisnis kamu:\n${context.trim()}`;
  }

  return base;
};

// ============================================================
// DATABASE HELPERS
// ============================================================

const getAIConfig = async (sessionId) => {
  const { data, error } = await supabase
    .from('ai_configs')
    .select('id, is_enabled, context, ollama_url, model, max_tokens, fallback_message')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error(`[AIReplyService] Gagal fetch ai_config untuk ${sessionId}:`, error.message);
    }
    return null;
  }

  if (!data || !data.is_enabled) return null;

  return data;
};

const getChatHistory = async (sessionId, contactNumber) => {
  const { data, error } = await supabase
    .from('ai_chat_histories')
    .select('messages')
    .eq('session_id', sessionId)
    .eq('contact_number', contactNumber)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error(`[AIReplyService] Gagal fetch chat history:`, error.message);
    }
    return [];
  }

  return Array.isArray(data?.messages) ? data.messages : [];
};

const saveChatHistory = async (sessionId, contactNumber, messages) => {
  const trimmedMessages = messages.slice(-MAX_HISTORY_LENGTH);

  const { error } = await supabase
    .from('ai_chat_histories')
    .upsert(
      {
        session_id:     sessionId,
        contact_number: contactNumber,
        messages:       trimmedMessages,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'session_id,contact_number' }
    );

  if (error) {
    console.error(`[AIReplyService] Gagal simpan chat history:`, error.message);
  }
};

const logAIReply = async (sessionId, to, replyText, isFallback = false) => {
  const { error } = await supabase.from('message_logs').insert({
    session_id:   sessionId,
    direction:    'outbound',
    phone_number: to,
    type:         'text',
    status:       'sent',
    source:       'ai_reply',
    payload:      { text: replyText, is_fallback: isFallback },
  });

  if (error) {
    console.error(`[AIReplyService] Gagal log balasan AI:`, error.message);
  }
};

// ============================================================
// OLLAMA REQUEST
// ============================================================

const requestOllama = async (config, system, history) => {
  const ollamaUrl = config.ollama_url || DEFAULT_OLLAMA_URL;
  const model     = config.model      || DEFAULT_MODEL;
  const maxTokens = config.max_tokens || DEFAULT_MAX_TOKENS;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...history,
        ],
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.7,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[AIReplyService] Ollama HTTP ${response.status}:`, errText);
      return null;
    }

    const data = await response.json();
    return data?.message?.content?.trim() || null;

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.error(`[AIReplyService] Request ke Ollama timeout (${OLLAMA_TIMEOUT_MS / 1000}s)`);
    } else {
      console.error(`[AIReplyService] Gagal request ke Ollama:`, err.message);
    }

    return null;
  }
};

// ============================================================
// GUARDS
// ============================================================

const shouldSkip = (msg) => {
  if (msg.fromMe)                          return true;
  if (msg.from === 'status@broadcast')     return true;
  if (msg.from?.endsWith('@g.us'))         return true;
  if (!msg.body || msg.body.trim() === '') return true;
  return false;
};

// ============================================================
// MAIN — getAIReply
// ============================================================

const getAIReply = async (sessionId, msg) => {
  if (shouldSkip(msg)) return null;

  const config = await getAIConfig(sessionId);
  if (!config) return null;

  const contactNumber = getContactNumber(msg);
  const incomingText  = msg.body.trim();
  const fallback      = config.fallback_message || DEFAULT_FALLBACK_MESSAGE;

  console.log(`[AIReplyService] Memproses pesan dari ${contactNumber} di sesi ${sessionId}`);

  const history        = await getChatHistory(sessionId, contactNumber);
  const updatedHistory = [...history, { role: 'user', content: incomingText }];
  const systemPrompt   = buildSystemPrompt(config.context);
  const aiReply        = await requestOllama(config, systemPrompt, updatedHistory);

  if (!aiReply) {
    console.warn(`[AIReplyService] AI gagal, menggunakan fallback untuk sesi ${sessionId}`);
    return { text: fallback, isFallback: true };
  }

  // Simpan history hanya jika AI berhasil (bukan fallback)
  await saveChatHistory(sessionId, contactNumber, [
    ...updatedHistory,
    { role: 'assistant', content: aiReply },
  ]);

  console.log(`[AIReplyService] ✓ Balasan AI siap untuk ${contactNumber}: "${aiReply.substring(0, 60)}..."`);

  return { text: aiReply, isFallback: false };
};

// ============================================================
// HANDLE INCOMING
// ============================================================

/**
 * Entry point utama yang dipanggil dari sessionManager.js.
 *
 * Menggunakan msg.reply() — BUKAN client.sendMessage() — agar
 * kompatibel dengan semua format ID WhatsApp termasuk @lid
 * yang digunakan pada perangkat multi-device.
 *
 * msg.reply() secara internal sudah tahu ke mana harus membalas
 * tanpa perlu kita resolve nomor kontak secara manual.
 */
const handleIncomingMessage = async (sessionId, msg) => { // client tidak diperlukan lagi
  const result = await getAIReply(sessionId, msg);
  if (!result) return;

  const { text: replyText, isFallback } = result;
  const contactNumber = getContactNumber(msg);

  // Typing indicator — non-critical
  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const typingDuration = isFallback
      ? 1500
      : Math.min(Math.max(replyText.length * 50, 1500), 5000);

    await sleep(typingDuration);
    await chat.clearState();
  } catch (err) {
    console.warn(`[AIReplyService] Typing state gagal (non-critical):`, err.message);
    await sleep(AI_REPLY_DELAY_MS);
  }

  try {
    // ✅ msg.reply() — kompatibel dengan @lid, @c.us, semua format
    await msg.reply(replyText);

    await logAIReply(sessionId, contactNumber, replyText, isFallback);

    console.log(
      isFallback
        ? `[AIReplyService] ⚠ Fallback terkirim ke ${contactNumber}`
        : `[AIReplyService] ✓ AI reply terkirim ke ${contactNumber}`
    );
  } catch (err) {
    console.error(`[AIReplyService] Gagal kirim balasan AI ke ${contactNumber}:`, err.message);
  }
};

// ============================================================
// UTILITY
// ============================================================

const clearChatHistory = async (sessionId, contactNumber) => {
  const { error } = await supabase
    .from('ai_chat_histories')
    .delete()
    .eq('session_id', sessionId)
    .eq('contact_number', contactNumber);

  if (error) {
    console.error(`[AIReplyService] Gagal hapus chat history:`, error.message);
    return false;
  }

  console.log(`[AIReplyService] History dihapus: ${contactNumber} @ ${sessionId}`);
  return true;
};

const clearAllHistoriesBySession = async (sessionId) => {
  const { error } = await supabase
    .from('ai_chat_histories')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    console.error(`[AIReplyService] Gagal hapus semua history sesi ${sessionId}:`, error.message);
  }
};

module.exports = {
  handleIncomingMessage,
  getAIReply,
  clearChatHistory,
  clearAllHistoriesBySession,
};