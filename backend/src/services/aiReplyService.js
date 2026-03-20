'use strict';

const supabase = require('../config/supabase');

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_OLLAMA_URL       = 'http://localhost:11434';
const DEFAULT_MODEL_OLLAMA     = 'qwen2.5:7b';
const DEFAULT_MODEL_GROQ       = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS       = 500;
const MAX_HISTORY_LENGTH       = 20;
const AI_REPLY_DELAY_MS        = 1500;
const OLLAMA_TIMEOUT_MS        = 15_000;  // 15 detik
const GROQ_TIMEOUT_MS          = 10_000;  // 10 detik (Groq lebih cepat)

const GROQ_API_URL             = 'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_FALLBACK_MESSAGE = 'Maaf, saya sedang tidak bisa memproses pesan Anda saat ini. Tim kami akan segera menghubungi Anda.';

// ============================================================
// HELPERS
// ============================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ambil identifier kontak untuk keperluan logging & history.
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
    .select('id, is_enabled, context, ollama_url, model, max_tokens, fallback_message, provider, groq_api_key')
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

const logAIReply = async (sessionId, to, replyText, isFallback = false, provider = 'unknown') => {
  const { error } = await supabase.from('message_logs').insert({
    session_id:   sessionId,
    direction:    'outbound',
    phone_number: to,
    type:         'text',
    status:       'sent',
    source:       'ai_reply',
    payload:      { text: replyText, is_fallback: isFallback, provider },
  });

  if (error) {
    console.error(`[AIReplyService] Gagal log balasan AI:`, error.message);
  }
};

// ============================================================
// PROVIDER: OLLAMA
// ============================================================

const requestOllama = async (config, system, history) => {
  const ollamaUrl = config.ollama_url || DEFAULT_OLLAMA_URL;
  const model     = config.model      || DEFAULT_MODEL_OLLAMA;
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
      throw new Error(`Ollama HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data?.message?.content?.trim() || null;

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.error(`[AIReplyService] Ollama timeout (${OLLAMA_TIMEOUT_MS / 1000}s)`);
    } else {
      console.error(`[AIReplyService] Ollama error:`, err.message);
    }

    return null;
  }
};

// ============================================================
// PROVIDER: GROQ
// ============================================================

const requestGroq = async (config, system, history) => {
  const apiKey    = config.groq_api_key;
  const maxTokens = config.max_tokens || DEFAULT_MAX_TOKENS;

  if (!apiKey) {
    console.warn(`[AIReplyService] Groq API key tidak ditemukan`);
    return null;
  }

  // Gunakan model yang sudah disimpan jika ada, jika tidak pakai default Groq
  // Model Groq berbeda dengan Ollama, jadi pakai default khusus Groq
  const model = config.model && !config.model.includes(':')
    ? config.model          // sudah format Groq (misal: llama-3.3-70b-versatile)
    : DEFAULT_MODEL_GROQ;   // fallback ke default Groq

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...history,
        ],
        max_tokens:  maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Groq HTTP ${response.status}: ${errData?.error?.message || 'unknown error'}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.error(`[AIReplyService] Groq timeout (${GROQ_TIMEOUT_MS / 1000}s)`);
    } else {
      console.error(`[AIReplyService] Groq error:`, err.message);
    }

    // Re-throw agar dispatcher bisa handle fallback
    throw err;
  }
};

// ============================================================
// DISPATCHER — Pilih provider, handle fallback
// ============================================================

/**
 * Jalankan AI request sesuai provider yang dipilih user.
 * Mengembalikan { reply, usedProvider } atau { reply: null }
 *
 * Provider:
 *   'ollama' → hanya Ollama
 *   'groq'   → hanya Groq
 *   'auto'   → coba Groq dulu, fallback ke Ollama jika gagal
 */
const dispatchAIRequest = async (config, systemPrompt, history) => {
  const provider = config.provider || 'ollama';

  // --- Hanya Ollama ---
  if (provider === 'ollama') {
    const reply = await requestOllama(config, systemPrompt, history);
    return { reply, usedProvider: 'ollama' };
  }

  // --- Hanya Groq ---
  if (provider === 'groq') {
    try {
      const reply = await requestGroq(config, systemPrompt, history);
      return { reply, usedProvider: 'groq' };
    } catch {
      return { reply: null, usedProvider: 'groq' };
    }
  }

  // --- Auto: Groq dulu, fallback ke Ollama ---
  if (provider === 'auto') {
    try {
      console.log(`[AIReplyService] Mencoba Groq...`);
      const reply = await requestGroq(config, systemPrompt, history);
      if (reply) {
        console.log(`[AIReplyService] ✓ Groq berhasil`);
        return { reply, usedProvider: 'groq' };
      }
      throw new Error('Groq reply kosong');
    } catch (err) {
      console.warn(`[AIReplyService] ⚠ Groq gagal (${err.message}), fallback ke Ollama...`);
      const reply = await requestOllama(config, systemPrompt, history);
      return { reply, usedProvider: 'ollama' };
    }
  }

  return { reply: null, usedProvider: 'unknown' };
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

  console.log(`[AIReplyService] Memproses pesan dari ${contactNumber} via ${config.provider || 'ollama'}`);

  const history        = await getChatHistory(sessionId, contactNumber);
  const updatedHistory = [...history, { role: 'user', content: incomingText }];
  const systemPrompt   = buildSystemPrompt(config.context);

  const { reply: aiReply, usedProvider } = await dispatchAIRequest(config, systemPrompt, updatedHistory);

  if (!aiReply) {
    console.warn(`[AIReplyService] Semua provider gagal, menggunakan fallback`);
    return { text: fallback, isFallback: true, provider: 'fallback' };
  }

  // Simpan history hanya jika AI berhasil
  await saveChatHistory(sessionId, contactNumber, [
    ...updatedHistory,
    { role: 'assistant', content: aiReply },
  ]);

  console.log(`[AIReplyService] ✓ Reply dari ${usedProvider}: "${aiReply.substring(0, 60)}..."`);

  return { text: aiReply, isFallback: false, provider: usedProvider };
};

// ============================================================
// HANDLE INCOMING
// ============================================================

const handleIncomingMessage = async (sessionId, msg) => {
  const result = await getAIReply(sessionId, msg);
  if (!result) return;

  const { text: replyText, isFallback, provider } = result;
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
    await msg.reply(replyText);
    await logAIReply(sessionId, contactNumber, replyText, isFallback, provider);

    console.log(
      isFallback
        ? `[AIReplyService] ⚠ Fallback terkirim ke ${contactNumber}`
        : `[AIReplyService] ✓ [${provider}] Reply terkirim ke ${contactNumber}`
    );
  } catch (err) {
    console.error(`[AIReplyService] Gagal kirim balasan ke ${contactNumber}:`, err.message);
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