-- ============================================================
-- WebWA Gateway — Supabase Database Schema
-- Versi  : 1.0.0
-- Tanggal: 19 Maret 2026
-- ============================================================
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor
--   2. Paste seluruh file ini & klik "Run"
-- ============================================================


-- ------------------------------------------------------------
-- EXTENSIONS
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- Untuk gen_random_uuid() & crypt()
CREATE EXTENSION IF NOT EXISTS "pg_net";     -- Untuk HTTP call (webhook delivery, opsional)


-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------

-- Status koneksi sesi WhatsApp
CREATE TYPE session_status AS ENUM (
  'pending',
  'authenticating',
  'connected',
  'disconnected'
);

-- Arah pesan (masuk/keluar)
CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

-- Tipe konten pesan
CREATE TYPE message_type AS ENUM (
  'text',
  'image',
  'document',
  'video',
  'audio',
  'sticker'
);

-- Status pengiriman pesan
CREATE TYPE message_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'read',
  'failed'
);

-- Tipe rencana/tier pengguna (untuk roadmap monetisasi)
CREATE TYPE user_plan AS ENUM (
  'free',
  'pro',
  'business'
);


-- ============================================================
-- TABEL 1: profiles
-- Ekstensi dari tabel auth.users bawaan Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  avatar_url    TEXT,
  plan          user_plan   NOT NULL DEFAULT 'free',
  max_sessions  INT         NOT NULL DEFAULT 2,    -- Batas sesi sesuai plan
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
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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
  -- PENTING: Simpan hash SHA-256 dari API Key, bukan plain text!
  -- Backend harus hash key sebelum disimpan & saat validasi
  key_hash      TEXT        NOT NULL UNIQUE,
  -- Prefix 8 karakter pertama untuk identifikasi di UI (aman ditampilkan)
  key_prefix    TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.api_keys IS 'API Key untuk autentikasi akses REST API eksternal. Key disimpan dalam format hash.';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash dari API Key. Tidak pernah menyimpan plain text.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Prefix 8 karakter pertama untuk identifikasi di UI (misalnya: wwa_a1b2c3).';

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
  -- Nomor WA yang terhubung, diisi setelah event 'ready'
  phone_number  TEXT,
  status        session_status NOT NULL DEFAULT 'pending',
  -- URL tujuan pengiriman event inbound (pesan masuk, dll.)
  webhook_url   TEXT,
  -- Backend menggunakan session_id ini sebagai folder LocalAuth
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sessions IS 'Sesi WhatsApp yang terhubung per pengguna.';
COMMENT ON COLUMN public.sessions.webhook_url IS 'URL untuk pengiriman event inbound (pesan masuk, status update).';

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON public.sessions(status);

CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ============================================================
-- TABEL 4: message_logs
-- Riwayat semua pesan inbound & outbound untuk analitik
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_logs (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID             NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  -- ID pesan dari whatsapp-web.js (untuk menghindari duplikasi)
  wa_message_id  TEXT,
  direction      message_direction NOT NULL,
  -- Nomor pengirim (inbound) atau penerima (outbound)
  phone_number   TEXT             NOT NULL,
  type           message_type     NOT NULL DEFAULT 'text',
  status         message_status   NOT NULL DEFAULT 'queued',
  -- Payload lengkap: { text: "..." } atau { media_url: "...", caption: "..." }
  payload        JSONB            NOT NULL DEFAULT '{}',
  -- Error message jika status = 'failed'
  error_message  TEXT,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.message_logs IS 'Riwayat semua pesan inbound dan outbound untuk analitik dan debugging.';

CREATE INDEX IF NOT EXISTS idx_message_logs_session_id  ON public.message_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_direction   ON public.message_logs(direction);
CREATE INDEX IF NOT EXISTS idx_message_logs_status      ON public.message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at  ON public.message_logs(created_at DESC);
-- Index untuk mencegah duplikasi pesan inbound dari WA
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_logs_wa_id
  ON public.message_logs(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

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
  -- HTTP status code respons dari endpoint pengguna
  response_status INT,
  -- Percobaan ke-berapa (1 = pertama, 2 = retry 1, dst.)
  attempt_number  INT         NOT NULL DEFAULT 1,
  is_success      BOOLEAN     NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  -- Waktu pengiriman percobaan ini
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.webhook_deliveries IS 'Log semua percobaan pengiriman webhook, termasuk retry.';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_log_id
  ON public.webhook_deliveries(message_log_id);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Setiap pengguna hanya bisa akses data miliknya sendiri
-- ============================================================

-- --- profiles ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- --- api_keys ---
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

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

-- Hanya backend (service_role) yang boleh insert/update log
-- Frontend tidak perlu akses tulis direct ke message_logs
CREATE POLICY "Service role can manage message_logs"
  ON public.message_logs FOR ALL
  USING (auth.role() = 'service_role');


-- --- webhook_deliveries ---
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

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


-- ============================================================
-- VIEWS (Opsional — untuk kemudahan query dari dashboard)
-- ============================================================

-- View: statistik ringkasan per sesi
CREATE OR REPLACE VIEW public.session_stats AS
SELECT
  s.id                                             AS session_id,
  s.user_id,
  s.session_name,
  s.phone_number,
  s.status,
  COUNT(ml.id)                                     AS total_messages,
  COUNT(ml.id) FILTER (WHERE ml.direction = 'outbound') AS total_sent,
  COUNT(ml.id) FILTER (WHERE ml.direction = 'inbound')  AS total_received,
  COUNT(ml.id) FILTER (WHERE ml.status = 'failed')      AS total_failed,
  MAX(ml.created_at)                               AS last_message_at
FROM public.sessions s
LEFT JOIN public.message_logs ml ON ml.session_id = s.id
GROUP BY s.id, s.user_id, s.session_name, s.phone_number, s.status;

COMMENT ON VIEW public.session_stats IS 'Statistik ringkasan pesan per sesi WhatsApp.';


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function: Hapus sesi dan semua data terkait (logs, deliveries)
-- Dipanggil dari backend saat user menghapus sesi
CREATE OR REPLACE FUNCTION public.delete_session_cascade(p_session_id UUID, p_user_id UUID)
RETURNS VOID
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

  -- Hapus sesi (CASCADE akan hapus message_logs & webhook_deliveries)
  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;


-- Function: Validasi API Key
-- Menerima raw API key, cek hash-nya di tabel api_keys
-- Mengembalikan user_id jika valid, NULL jika tidak valid
-- Gunakan fungsi ini di backend via Supabase RPC
CREATE OR REPLACE FUNCTION public.validate_api_key(p_raw_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.api_keys
  WHERE key_hash  = encode(digest(p_raw_key, 'sha256'), 'hex')
    AND is_active = TRUE;

  -- Update last_used_at jika key valid
  IF v_user_id IS NOT NULL THEN
    UPDATE public.api_keys
    SET    last_used_at = NOW()
    WHERE  key_hash = encode(digest(p_raw_key, 'sha256'), 'hex');
  END IF;

  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION public.validate_api_key IS
  'Validasi raw API Key. Mengembalikan user_id jika valid, NULL jika tidak.';


-- ============================================================
-- REALTIME (Aktifkan publikasi untuk tabel yang perlu real-time)
-- ============================================================
-- Jalankan jika ingin Supabase Realtime aktif untuk tabel ini
-- (Opsional — dashboard sudah pakai Socket.io)

-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;


-- ============================================================
-- DATA AWAL (Seed — Opsional untuk development)
-- ============================================================
-- Uncomment hanya untuk environment development/testing

/*
-- Contoh insert profile (user harus dibuat dulu via Supabase Auth)
-- INSERT INTO public.profiles (id, full_name, plan, max_sessions)
-- VALUES ('your-auth-user-uuid', 'Developer Test', 'pro', 10);
*/


-- ============================================================
-- SELESAI
-- ============================================================
-- Jalankan perintah berikut di SQL Editor untuk verifikasi:
--
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
--   SELECT * FROM public.session_stats LIMIT 5;
--
-- ============================================================
