'use strict';

const supabase = require('../config/supabase');

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL      = 'qwen2.5:7b';
const DEFAULT_MAX_TOKENS = 500;
const MAX_HISTORY_LENGTH = 20;       // Maksimal pesan dalam history per kontak
const AI_REPLY_DELAY_MS  = 1500;     // Delay natural sebelum kirim balasan (ms)
const OLLAMA_TIMEOUT_MS  = 90_000;   // Timeout request ke Ollama (30 detik)

const DEFAULT_FALLBACK_MESSAGE = 'Maaf, saya sedang tidak bisa memproses pesan Anda saat ini. Tim kami akan segera menghubungi Anda.';

// ============================================================
// HELPERS
// ============================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Buat system prompt dari konteks yang diberikan user.
 * @param {string} context - Informasi bisnis dari user
 * @returns {string}
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

/**
 * Ambil konfigurasi AI untuk sesi tertentu dari tabel ai_configs.
 * Mengembalikan null jika tidak ditemukan atau is_enabled = false.
 *
 * @param {string} sessionId - UUID sesi
 * @returns {Promise<Object|null>}
 */
const getAIConfig = async (sessionId) => {
  const { data, error } = await supabase
    .from('ai_configs')
    .select('id, is_enabled, context, ollama_url, model, max_tokens, fallback_message')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    // PGRST116 = row not found, bukan error kritis
    if (error.code !== 'PGRST116') {
      console.error(`[AIReplyService] Gagal fetch ai_config untuk ${sessionId}:`, error.message);
    }
    return null;
  }

  if (!data || !data.is_enabled) return null;

  return data;
};

/**
 * Ambil history percakapan AI untuk kontak tertentu di sesi tertentu.
 * Jika belum ada, kembalikan array kosong.
 *
 * @param {string} sessionId     - UUID sesi
 * @param {string} contactNumber - Nomor WA kontak
 * @returns {Promise<Array>}
 */
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

/**
 * Simpan/update history percakapan AI ke tabel ai_chat_histories.
 * Menggunakan UPSERT berdasarkan (session_id, contact_number).
 * History dibatasi MAX_HISTORY_LENGTH pesan terakhir.
 *
 * @param {string} sessionId     - UUID sesi
 * @param {string} contactNumber - Nomor WA kontak
 * @param {Array}  messages      - Array history [{role, content}, ...]
 */
const saveChatHistory = async (sessionId, contactNumber, messages) => {
  // Batasi history agar tidak membebani context window Ollama
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

/**
 * Catat pesan balasan AI ke tabel message_logs.
 * Menggunakan source = 'ai_reply' untuk membedakan dari API/manual.
 *
 * @param {string} sessionId - UUID sesi
 * @param {string} to        - Nomor WA tujuan
 * @param {string} replyText - Teks balasan dari AI
 */
const logAIReply = async (sessionId, to, replyText) => {
  const { error } = await supabase.from('message_logs').insert({
    session_id:   sessionId,
    direction:    'outbound',
    phone_number: to,
    type:         'text',
    status:       'sent',
    source:       'ai_reply',
    payload:      { text: replyText, isFallback: isFallback },
  });

  if (error) {
    console.error(`[AIReplyService] Gagal log balasan AI:`, error.message);
  }
};

// ============================================================
// OLLAMA REQUEST
// ============================================================

/**
 * Kirim request ke Ollama API /api/chat dan ambil respons teks.
 *
 * @param {Object} config   - Konfigurasi dari ai_configs
 * @param {string} system   - System prompt
 * @param {Array}  history  - History percakapan [{role, content}, ...]
 * @returns {Promise<string|null>} - Teks balasan AI, atau null jika gagal
 */
const requestOllama = async (config, system, history) => {
  const ollamaUrl  = config.ollama_url || DEFAULT_OLLAMA_URL;
  const model      = config.model      || DEFAULT_MODEL;
  const maxTokens  = config.max_tokens || DEFAULT_MAX_TOKENS;

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
// GUARDS — Pesan yang tidak perlu dibalas AI
// ============================================================

/**
 * Cek apakah pesan perlu di-skip (tidak perlu dibalas AI).
 * - Pesan dari diri sendiri (fromMe)
 * - Pesan dari grup (format: xxxxxx@g.us)
 * - Pesan broadcast/status
 * - Pesan non-teks (media, sticker, dll) yang body-nya kosong
 *
 * @param {Object} msg - Message object dari whatsapp-web.js
 * @returns {boolean}
 */
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

/**
 * Proses utama: terima pesan masuk, cek konfigurasi AI sesi,
 * ambil history, kirim ke Ollama, simpan history, kembalikan balasan.
 *
 * @param {string} sessionId - UUID sesi
 * @param {Object} msg       - Message object dari whatsapp-web.js
 * @returns {Promise<string|null>} - Teks balasan AI atau null jika skip/error
 */
const getAIReply = async (sessionId, msg) => {
  // --- Guard: abaikan pesan yang tidak perlu dibalas ---
  if (shouldSkip(msg)) return null;

  // --- Ambil konfigurasi AI (juga cek is_enabled) ---
  const config = await getAIConfig(sessionId);
  if (!config) return null;

  const contactNumber = msg.from;
  const incomingText  = msg.body.trim();
  const fallback      = config.fallback_message || DEFAULT_FALLBACK_MESSAGE;

  console.log(`[AIReplyService] Memproses pesan dari ${contactNumber} di sesi ${sessionId}`);

  // --- Ambil history percakapan kontak ini ---
  const history = await getChatHistory(sessionId, contactNumber);

  // --- Tambahkan pesan baru ke history ---
  const updatedHistory = [
    ...history,
    { role: 'user', content: incomingText },
  ];

  // --- Bangun system prompt dari konteks user ---
  const systemPrompt = buildSystemPrompt(config.context);

  // --- Request ke Ollama ---
  const aiReply = await requestOllama(config, systemPrompt, updatedHistory);

  if (!aiReply) {
    console.warn(`[AIReplyService] Tidak ada balasan dari Ollama untuk sesi ${sessionId}`);
    return { text: fallback, isFallback: true };
  }

  // --- Simpan history yang sudah diupdate (termasuk balasan AI) ---
  await saveChatHistory(sessionId, contactNumber, [
    ...updatedHistory,
    { role: 'assistant', content: aiReply },
  ]);

  console.log(`[AIReplyService] ✓ Balasan AI siap untuk ${contactNumber}: "${aiReply.substring(0, 60)}..."`);

  return { text: aiReply, isFallback: false };
};

// ============================================================
// SEND WITH DELAY — Wrapper untuk kirim + log
// ============================================================

/**
 * Kirim balasan AI ke kontak via WhatsApp client dengan delay natural,
 * lalu catat ke message_logs.
 *
 * Gunakan fungsi ini di handler 'message' pada sessionManager.js
 * sebagai fire-and-forget (gunakan .catch(console.error)).
 *
 * Contoh penggunaan:
 *   aiReplyService
 *     .handleIncomingMessage(sessionId, msg, client)
 *     .catch(console.error);
 *
 * @param {string} sessionId - UUID sesi
 * @param {Object} msg       - Message object dari whatsapp-web.js
 * @param {Object} client    - WhatsApp Client instance
 */
const handleIncomingMessage = async (sessionId, msg, client) => {
  const aiReply = await getAIReply(sessionId, msg);
  if (!aiReply) return;

  // Typing indicator — non-critical, jangan sampai crash flow utama
  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    // Dinamis sesuai panjang teks: ~50ms/karakter, min 1.5s, max 5s
    const typingDuration = isFallback
      ? 1500  // fallback cukup delay singkat
      : Math.min(Math.max(aiReply.length * 50, 1500), 5000);
    await sleep(typingDuration);

    await chat.clearState();
  } catch (err) {
    console.warn(`[AIReplyService] Typing state gagal (non-critical):`, err.message);
    await sleep(AI_REPLY_DELAY_MS); // fallback ke delay default jika typing gagal
  }

  try {
    await client.sendMessage(msg.from, aiReply);
    await logAIReply(sessionId, msg.from, aiReply);
    console.log(
      isFallback
        ? `[AIReplyService] ⚠ Fallback terkirim ke ${msg.from}`
        : `[AIReplyService] ✓ AI reply terkirim ke ${msg.from}`
    );
  } catch (err) {
    console.error(`[AIReplyService] Gagal kirim balasan AI ke ${msg.from}:`, err.message);
  }
};

// ============================================================
// UTILITY — Reset history kontak tertentu
// ============================================================

/**
 * Hapus history percakapan AI untuk kontak tertentu di sesi tertentu.
 * Berguna jika user ingin memulai percakapan baru dari awal.
 *
 * @param {string} sessionId
 * @param {string} contactNumber
 */
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

/**
 * Hapus semua history percakapan AI untuk satu sesi.
 * Dipanggil saat sesi dihapus.
 *
 * @param {string} sessionId
 */
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