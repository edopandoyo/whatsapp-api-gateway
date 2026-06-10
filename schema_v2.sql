-- ============================================================
-- WebWA Gateway — Supabase Database Schema
-- Versi  : 2.0.0
-- Tanggal: 10 Juni 2026
-- ============================================================
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor
--   2. Paste seluruh file ini & klik "Run"
--   ATAU via Supabase CLI: supabase db reset --db-url <URL>
-- ============================================================
-- PERUBAHAN dari v1.0.0:
--   + Tambah nilai enum: message_status → 'received'
--   + Tambah nilai enum: message_type  → 'media'
--   + Tambah kolom: message_logs.source (TEXT, nullable)
--   + Tabel baru: ai_configs        (konfigurasi AI Auto Reply)
--   + Tabel baru: ai_chat_histories (riwayat percakapan AI)
-- ============================================================


-- ------------------------------------------------------------
-- EXTENSIONS
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() & crypt()
CREATE EXTENSION IF NOT EXISTS "pg_net";     -- HTTP call (webhook delivery, opsional)


-- ============================================================
-- ENUM TYPES
-- ============================================================

-- Status koneksi sesi WhatsApp
DO $$ BEGIN
  CREATE TYPE session_status AS ENUM (
    'pending',
    'authenticating',
    'connected',
    'disconnected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Arah pesan (masuk/keluar)
DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM (
    'inbound',
    'outbound'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tipe konten pesan
-- 'media' = type generik yang dipakai endpoint /messages/media
DO $$ BEGIN
  CREATE TYPE message_type AS ENUM (
    'text',
    'image',
    'document',
    'video',
    'audio',
    'sticker',
    'media'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tambahkan nilai 'media' jika belum ada (idempotent untuk upgrade schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'message_type'::regtype
      AND enumlabel = 'media'
  ) THEN
    ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'media';
  END IF;
END $$;

-- Status pengiriman pesan
-- 'received' = pesan inbound yang sudah diterima dari WhatsApp
DO $$ BEGIN
  CREATE TYPE message_status AS ENUM (
    'queued',
    'sent',
    'delivered',
    'read',
    'failed',
    'received'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tambahkan nilai 'received' jika belum ada (idempotent untuk upgrade schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'message_status'::regtype
      AND enumlabel = 'received'
  ) THEN
    ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'received';
  END IF;
END $$;

-- Tipe rencana/tier pengguna (untuk roadmap monetisasi)
DO $$ BEGIN
  CREATE TYPE user_plan AS ENUM (
    'free',
    'pro',
    'business'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Provider AI untuk Auto Reply
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM (
    'ollama',
    'groq',
    'auto'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- TABEL 1: profiles
-- Ekstensi dari tabel auth.users bawaan Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  avatar_url    TEXT,
  plan          user_plan   NOT NULL DEFAULT 'free',
  max_sessions  INT         NOT NULL DEFAULT 2,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Profil pengguna, ekstensi dari auth.users Supabase.';
COMMENT ON COLUMN public.profiles.max_sessions IS 'Jumlah maksimal sesi WA yang diizinkan sesuai plan.';

-- Trigger: otomatis buat profil saat user baru mendaftar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function: auto-update kolom updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- TABEL 2: api_keys
-- API Key untuk autentikasi akses endpoint eksternal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label         TEXT        NOT NULL DEFAULT 'Default Key',
  -- Simpan hash SHA-256 dari API Key — TIDAK boleh plain text!
  key_hash      TEXT        NOT NULL UNIQUE,
  -- Prefix 8 karakter pertama untuk identifikasi di UI (aman ditampilkan)
  key_prefix    TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.api_keys IS 'API Key untuk autentikasi REST API eksternal. Key disimpan dalam format hash SHA-256.';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash dari API Key. Tidak pernah menyimpan plain text.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Prefix (e.g.: wa_a1b2c3d4) untuk identifikasi di UI — aman ditampilkan.';

-- Index untuk lookup cepat saat validasi
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON public.api_keys(user_id);


-- ============================================================
-- TABEL 3: sessions
-- Sesi WhatsApp yang terhubung per pengguna
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_name  TEXT           NOT NULL,
  phone_number  TEXT,
  status        session_status NOT NULL DEFAULT 'pending',
  webhook_url   TEXT,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sessions IS 'Sesi WhatsApp yang terhubung per pengguna.';
COMMENT ON COLUMN public.sessions.webhook_url IS 'URL untuk pengiriman event inbound (pesan masuk, status update).';

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON public.sessions(status);

DROP TRIGGER IF EXISTS sessions_set_updated_at ON public.sessions;
CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- TABEL 4: message_logs
-- Riwayat semua pesan inbound & outbound
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_logs (
  id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID              NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  wa_message_id  TEXT,
  direction      message_direction NOT NULL,
  phone_number   TEXT              NOT NULL,
  type           message_type      NOT NULL DEFAULT 'text',
  status         message_status    NOT NULL DEFAULT 'queued',
  -- 'api_call' | 'ai_reply' | 'manual' | NULL
  -- Membedakan asal-usul pesan outbound
  source         TEXT,
  payload        JSONB             NOT NULL DEFAULT '{}',
  error_message  TEXT,
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.message_logs IS 'Riwayat semua pesan inbound dan outbound untuk analitik dan debugging.';
COMMENT ON COLUMN public.message_logs.source IS 'Sumber pesan outbound: api_call | ai_reply | manual | NULL.';

CREATE INDEX IF NOT EXISTS idx_message_logs_session_id  ON public.message_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_direction   ON public.message_logs(direction);
CREATE INDEX IF NOT EXISTS idx_message_logs_status      ON public.message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_source      ON public.message_logs(source);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at  ON public.message_logs(created_at DESC);
-- Index partial untuk mencegah duplikasi pesan inbound dari WA
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_logs_wa_id
  ON public.message_logs(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS message_logs_set_updated_at ON public.message_logs;
CREATE TRIGGER message_logs_set_updated_at
  BEFORE UPDATE ON public.message_logs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- TABEL 5: webhook_deliveries
-- Log percobaan pengiriman webhook (termasuk retry)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_log_id  UUID        NOT NULL REFERENCES public.message_logs(id) ON DELETE CASCADE,
  webhook_url     TEXT        NOT NULL,
  response_status INT,
  attempt_number  INT         NOT NULL DEFAULT 1,
  is_success      BOOLEAN     NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.webhook_deliveries IS 'Log semua percobaan pengiriman webhook, termasuk retry.';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_log_id
  ON public.webhook_deliveries(message_log_id);


-- ============================================================
-- TABEL 6: ai_configs
-- Konfigurasi AI Auto Reply per sesi WhatsApp
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_configs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  is_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Informasi konteks bisnis yang diinjeksikan ke system prompt AI
  context          TEXT        NOT NULL DEFAULT '',
  -- Provider AI: 'ollama' | 'groq' | 'auto'
  provider         TEXT        NOT NULL DEFAULT 'ollama',
  -- Konfigurasi Ollama (self-hosted)
  ollama_url       TEXT        NOT NULL DEFAULT 'http://localhost:11434',
  -- Nama model (Ollama: 'qwen2.5:7b', Groq: 'llama-3.3-70b-versatile', dst.)
  model            TEXT        NOT NULL DEFAULT 'qwen2.5:7b',
  max_tokens       INT         NOT NULL DEFAULT 500
                               CHECK (max_tokens BETWEEN 100 AND 4000),
  -- Pesan fallback jika semua provider gagal
  fallback_message TEXT        NOT NULL DEFAULT 'Maaf, saya sedang tidak bisa memproses pesan Anda saat ini. Tim kami akan segera menghubungi Anda.',
  -- Groq API Key (opsional, diperlukan jika provider = 'groq' atau 'auto')
  -- Disimpan plain text — pertimbangkan enkripsi untuk production
  groq_api_key     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_configs IS 'Konfigurasi AI Auto Reply per sesi WhatsApp. Setiap sesi maksimal satu konfigurasi.';
COMMENT ON COLUMN public.ai_configs.provider IS 'Provider AI: ollama (self-hosted), groq (cloud), auto (coba Groq dulu, fallback ke Ollama).';
COMMENT ON COLUMN public.ai_configs.groq_api_key IS 'Groq Cloud API Key. Diperlukan jika provider = groq atau auto.';
COMMENT ON COLUMN public.ai_configs.context IS 'Informasi bisnis yang diinjeksikan ke system prompt AI sebagai konteks.';

CREATE INDEX IF NOT EXISTS idx_ai_configs_session_id ON public.ai_configs(session_id);

DROP TRIGGER IF EXISTS ai_configs_set_updated_at ON public.ai_configs;
CREATE TRIGGER ai_configs_set_updated_at
  BEFORE UPDATE ON public.ai_configs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- TABEL 7: ai_chat_histories
-- Riwayat percakapan AI per sesi + nomor kontak
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_chat_histories (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  -- Nomor WA kontak (format: 628xxxx@c.us)
  contact_number TEXT        NOT NULL,
  -- Array JSON berformat OpenAI: [{ role: 'user'|'assistant', content: '...' }]
  -- Maksimal 20 entri terakhir (sliding window, lihat MAX_HISTORY_LENGTH di aiReplyService)
  messages       JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Satu session + contact_number = satu row (di-upsert)
  CONSTRAINT uq_ai_chat_histories UNIQUE (session_id, contact_number)
);

COMMENT ON TABLE public.ai_chat_histories IS 'Riwayat percakapan AI per sesi dan kontak. Disimpan sebagai array JSON format OpenAI (max 20 pesan).';
COMMENT ON COLUMN public.ai_chat_histories.contact_number IS 'Nomor WA kontak dalam format WhatsApp (e.g.: 6281234567890@c.us).';
COMMENT ON COLUMN public.ai_chat_histories.messages IS 'Array percakapan format OpenAI: [{ role: user|assistant, content: string }].';

CREATE INDEX IF NOT EXISTS idx_ai_chat_histories_session_id ON public.ai_chat_histories(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_histories_contact    ON public.ai_chat_histories(contact_number);

DROP TRIGGER IF EXISTS ai_chat_histories_set_updated_at ON public.ai_chat_histories;
CREATE TRIGGER ai_chat_histories_set_updated_at
  BEFORE UPDATE ON public.ai_chat_histories
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Setiap pengguna hanya bisa akses data miliknya sendiri
-- ============================================================

-- --- profiles ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- --- api_keys ---
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own api_keys"   ON public.api_keys;
DROP POLICY IF EXISTS "Users can insert own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete own api_keys" ON public.api_keys;

CREATE POLICY "Users can view own api_keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api_keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api_keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api_keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);


-- --- sessions ---
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions"   ON public.sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;

CREATE POLICY "Users can view own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);


-- --- message_logs ---
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own message_logs"     ON public.message_logs;
DROP POLICY IF EXISTS "Service role can manage message_logs" ON public.message_logs;

-- User bisa baca log milik sesi mereka sendiri
CREATE POLICY "Users can view own message_logs"
  ON public.message_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
  );

-- Hanya backend (service_role) yang boleh insert/update/delete log
CREATE POLICY "Service role can manage message_logs"
  ON public.message_logs FOR ALL
  USING (auth.role() = 'service_role');


-- --- webhook_deliveries ---
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own webhook_deliveries"     ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Service role can manage webhook_deliveries" ON public.webhook_deliveries;

CREATE POLICY "Users can view own webhook_deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.message_logs ml
      JOIN   public.sessions s ON s.id = ml.session_id
      WHERE  ml.id = message_log_id
        AND  s.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage webhook_deliveries"
  ON public.webhook_deliveries FOR ALL
  USING (auth.role() = 'service_role');


-- --- ai_configs ---
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai_configs"   ON public.ai_configs;
DROP POLICY IF EXISTS "Users can manage own ai_configs" ON public.ai_configs;

-- User bisa baca/kelola konfigurasi AI sesi miliknya
CREATE POLICY "Users can view own ai_configs"
  ON public.ai_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own ai_configs"
  ON public.ai_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
  );


-- --- ai_chat_histories ---
ALTER TABLE public.ai_chat_histories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai_chat_histories"     ON public.ai_chat_histories;
DROP POLICY IF EXISTS "Service role can manage ai_chat_histories" ON public.ai_chat_histories;

CREATE POLICY "Users can view own ai_chat_histories"
  ON public.ai_chat_histories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
  );

-- Backend (service_role) yang insert/update/delete riwayat chat AI
CREATE POLICY "Service role can manage ai_chat_histories"
  ON public.ai_chat_histories FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================
-- VIEWS
-- ============================================================

-- View: statistik ringkasan per sesi (termasuk data AI)
CREATE OR REPLACE VIEW public.session_stats AS
SELECT
  s.id                                                          AS session_id,
  s.user_id,
  s.session_name,
  s.phone_number,
  s.status,
  COUNT(ml.id)                                                  AS total_messages,
  COUNT(ml.id) FILTER (WHERE ml.direction = 'outbound')        AS total_sent,
  COUNT(ml.id) FILTER (WHERE ml.direction = 'inbound')         AS total_received,
  COUNT(ml.id) FILTER (WHERE ml.status    = 'failed')          AS total_failed,
  COUNT(ml.id) FILTER (WHERE ml.source    = 'ai_reply')        AS total_ai_replies,
  MAX(ml.created_at)                                           AS last_message_at,
  -- Info AI
  COALESCE(ac.is_enabled, FALSE)                               AS ai_enabled,
  ac.provider                                                   AS ai_provider
FROM public.sessions s
LEFT JOIN public.message_logs ml ON ml.session_id = s.id
LEFT JOIN public.ai_configs   ac ON ac.session_id  = s.id
GROUP BY s.id, s.user_id, s.session_name, s.phone_number, s.status,
         ac.is_enabled, ac.provider;

COMMENT ON VIEW public.session_stats IS 'Statistik ringkasan pesan per sesi WhatsApp, termasuk status AI Auto Reply.';


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function: Hapus sesi dan semua data terkait
CREATE OR REPLACE FUNCTION public.delete_session_cascade(p_session_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  -- CASCADE akan hapus message_logs, webhook_deliveries, ai_configs, ai_chat_histories
  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;

COMMENT ON FUNCTION public.delete_session_cascade IS
  'Hapus sesi beserta semua data terkait (CASCADE): message_logs, webhook_deliveries, ai_configs, ai_chat_histories.';


-- Function: Validasi API Key
-- Menerima raw API key, cek hash SHA-256, kembalikan user_id atau NULL
CREATE OR REPLACE FUNCTION public.validate_api_key(p_raw_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_key_hash TEXT;
BEGIN
  v_key_hash := encode(digest(p_raw_key, 'sha256'), 'hex');

  SELECT user_id INTO v_user_id
  FROM public.api_keys
  WHERE key_hash  = v_key_hash
    AND is_active = TRUE;

  -- Update last_used_at jika key valid
  IF v_user_id IS NOT NULL THEN
    UPDATE public.api_keys
    SET    last_used_at = NOW()
    WHERE  key_hash = v_key_hash;
  END IF;

  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION public.validate_api_key IS
  'Validasi raw API Key via SHA-256. Mengembalikan user_id jika valid & aktif, NULL jika tidak.';


-- Function: Reset riwayat percakapan AI untuk satu kontak dalam sesi
CREATE OR REPLACE FUNCTION public.reset_ai_chat_history(
  p_session_id     UUID,
  p_contact_number TEXT,
  p_user_id        UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verifikasi kepemilikan sesi
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  DELETE FROM public.ai_chat_histories
  WHERE session_id     = p_session_id
    AND contact_number = p_contact_number;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reset_ai_chat_history IS
  'Reset riwayat percakapan AI untuk satu nomor kontak dalam sesi tertentu.';


-- ============================================================
-- REALTIME (Opsional — aktifkan jika butuh Supabase Realtime)
-- ============================================================
-- Dashboard sudah pakai Socket.io, tapi bisa diaktifkan untuk
-- kebutuhan lain (monitoring, dashboard admin, dll.)

-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_configs;


-- ============================================================
-- DATA AWAL / SEED (Opsional — hanya untuk development)
-- ============================================================
/*
-- Contoh insert profile (user harus dibuat dulu via Supabase Auth)
-- INSERT INTO public.profiles (id, full_name, plan, max_sessions)
-- VALUES ('your-auth-user-uuid', 'Developer Test', 'pro', 10);

-- Contoh insert ai_config untuk testing
-- INSERT INTO public.ai_configs (session_id, is_enabled, provider, context)
-- VALUES ('your-session-uuid', true, 'ollama', 'Kamu adalah asisten toko online kami.');
*/


-- ============================================================
-- VERIFIKASI SETELAH INSTALL
-- ============================================================
-- Jalankan query berikut di SQL Editor untuk verifikasi:
--
--   -- Cek semua tabel
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
--   -- Cek semua enum
--   SELECT t.typname, e.enumlabel
--   FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
--   WHERE t.typname IN ('session_status','message_direction','message_type','message_status','user_plan','ai_provider')
--   ORDER BY t.typname, e.enumsortorder;
--
--   -- Cek statistik sesi (setelah ada data)
--   SELECT * FROM public.session_stats LIMIT 5;
--
-- ============================================================
-- Tabel yang dibuat:
--   1. profiles           — profil pengguna (extends auth.users)
--   2. api_keys           — API Key terenkripsi (SHA-256 hash)
--   3. sessions           — sesi WhatsApp multi-device
--   4. message_logs       — log pesan inbound & outbound
--   5. webhook_deliveries — log pengiriman webhook + retry
--   6. ai_configs         — konfigurasi AI Auto Reply per sesi  [BARU]
--   7. ai_chat_histories  — riwayat percakapan AI per kontak    [BARU]
-- ============================================================
