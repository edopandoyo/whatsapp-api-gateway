# ✅ Task List — WebWA Gateway Development

> **Proyek:** WebWA Gateway
> **Update Terakhir:** 19 Maret 2026
> Legend: `[ ]` Belum | `[~]` In Progress | `[x]` Selesai

---

## 📦 PHASE 1 — Setup & Fondasi

### 1.1 Project Setup
- [x] Inisialisasi monorepo struktur folder (`/backend`, `/frontend`)
- [x] Setup `backend/` dengan `npm init` + install dependencies utama
  - `express`, `socket.io`, `whatsapp-web.js`, `@supabase/supabase-js`, `dotenv`, `cors`, `helmet`, `express-rate-limit`
- [x] Setup `frontend/` dengan `create-react-app` atau `Vite + React`
  - `@supabase/supabase-js`, `socket.io-client`, `qrcode.react`, `axios`, `react-router-dom`
- [x] Buat file `.env.example` untuk backend dan frontend
- [x] Setup `docker-compose.yml` (Backend + Frontend)
- [x] Buat `Dockerfile` untuk backend (Node.js + Chromium deps)
- [x] Buat `Dockerfile` untuk frontend (React + Nginx multi-stage)
- [x] Buat `nginx.conf` untuk serve React SPA
- [x] Buat `.gitignore` yang tepat (exclude `.env`, `.wwebjs_auth`, `node_modules`)
- [x] Setup Git repository & initial commit

### 1.2 Database Setup (Supabase)
- [ ] Buat project baru di Supabase
- [ ] Jalankan `schema.sql` untuk membuat semua tabel
- [ ] Aktifkan **Row Level Security (RLS)** pada semua tabel
- [ ] Buat semua RLS Policies (lihat `schema.sql`)
- [ ] Test koneksi Supabase dari backend menggunakan `service_role` key
- [ ] Test koneksi Supabase dari frontend menggunakan `anon` key

---

## 🔧 PHASE 2 — Backend Development

### 2.1 Server & Middleware
- [x] Setup Express server dengan `helmet`, `cors`, `morgan` (logger)
- [x] Integrasi Socket.io pada Express server
- [x] Buat middleware `authenticateApiKey` (validasi `x-api-key` → query tabel `api_keys`)
- [x] Buat middleware `authenticateJWT` (validasi Supabase Bearer Token)
- [x] Buat middleware `rateLimiter` dengan `express-rate-limit`
- [x] Setup error handler global (catch-all)
- [x] Setup environment config loader (`dotenv`) + validasi startup

### 2.2 WhatsApp Session Manager
- [x] Buat `SessionManager` module untuk mengelola multiple WA client instances
- [x] Implementasi `createSession(sessionId, io)` — init `whatsapp-web.js` client dengan `LocalAuth`
- [x] Implementasi `deleteSession(sessionId)` — logout & destroy client
- [x] Implementasi `getSession(sessionId)` — ambil client aktif dari Map
- [x] Implementasi `getAllSessions()` — list semua active sessions
- [x] Handle event `qr` → emit ke Socket.io room sesi terkait
- [x] Handle event `ready` → update status di Supabase + emit ke Socket.io
- [x] Handle event `authenticated` → emit ke Socket.io
- [x] Handle event `auth_failure` → update status di Supabase + emit ke Socket.io
- [x] Handle event `disconnected` → update status di Supabase + emit ke Socket.io
- [x] Handle event `message` (pesan masuk) → log ke DB + trigger webhook
- [x] Konfigurasi Puppeteer args: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`
- [x] Restore active sessions dari Supabase saat server restart

### 2.3 REST API — External Endpoints
- [x] `POST /api/v1/sessions/:sessionId/messages/text` — kirim pesan teks
  - [x] Validasi request body (`to`, `text`)
  - [x] Validasi sesi aktif & status `connected`
  - [x] Format nomor tujuan (tambahkan `@c.us` jika perlu)
  - [x] Kirim pesan via `client.sendMessage()`
  - [x] Insert log ke tabel `message_logs` (status: `sent`/`failed`)
  - [x] Return response dengan `message_id`
- [x] `POST /api/v1/sessions/:sessionId/messages/media` — kirim media (gambar/dokumen)
  - [x] Validasi request body (`to`, `mediaUrl`/`base64`, `mimetype`, `caption`)
  - [x] Download media dari URL atau base64 & buat `MessageMedia` object
  - [x] Kirim media via `client.sendMessage()`
  - [x] Insert log ke tabel `message_logs`
  - [x] Return response dengan `message_id`
- [x] `POST /api/v1/sessions/:sessionId/messages/bulk` — kirim pesan ke multiple nomor (maks 100)
  - [x] Delay 1.2s antar pesan untuk hindari spam-detect WhatsApp
  - [x] Log setiap pesan individual (sent/failed)

### 2.4 REST API — Internal Endpoints (Dashboard)
- [x] `POST /api/internal/sessions` — buat sesi baru
  - [x] Insert ke tabel `sessions` (status: `pending`)
  - [x] Panggil `SessionManager.createSession()`
- [x] `DELETE /api/internal/sessions/:id` — hapus sesi
  - [x] Panggil `SessionManager.deleteSession()`
  - [x] Hapus dari tabel `sessions`
- [x] `GET /api/internal/sessions` — list sesi user
  - [x] Query tabel `sessions` berdasarkan `user_id` dari JWT
- [x] `GET /api/internal/sessions/:id` — detail satu sesi (+ flag `process_alive`)
- [x] `PATCH /api/internal/sessions/:id` — update nama / webhook_url sesi
- [x] `POST /api/internal/sessions/:id/reconnect` — re-inisialisasi sesi terputus
- [x] `GET /api/internal/sessions/:id/messages` — riwayat pesan dengan paginasi
  - [x] Filter berdasarkan `direction` (inbound/outbound)
  - [x] Cursor-based pagination (`limit` + `offset`)
- [x] `POST /api/internal/api-keys` — buat API Key baru
  - [x] Generate random key (`wa_` + 32-byte hex)
  - [x] Hash API Key sebelum disimpan (SHA-256)
  - [x] Return API Key plain-text HANYA sekali (saat dibuat)
- [x] `GET /api/internal/api-keys` — list API keys milik user
- [x] `DELETE /api/internal/api-keys/:id` — nonaktifkan API Key (soft-delete)

### 2.5 Webhook Delivery
- [x] Buat `WebhookService` module (`src/services/webhookService.js`)
- [x] Implementasi `deliver(messageLogId, webhookUrl, payload)` menggunakan `axios`
- [x] Implementasi retry logic (3x retry, exponential backoff: 1s → 5s → 15s)
- [x] Log setiap attempt ke tabel `webhook_deliveries` (status, HTTP status, error)
- [x] Update `message_logs.webhook_status` setelah delivery

---

## 🎨 PHASE 3 — Frontend Development

### 3.1 Setup & Routing
- [x] Setup React Router (`react-router-dom`) dengan route:
  - [x] `/login` — halaman login
  - [x] `/register` — halaman registrasi
  - [x] `/dashboard` — halaman utama (protected)
  - [x] `/dashboard/sessions` — manajemen sesi
  - [x] `/dashboard/logs` — activity log
  - [x] `/dashboard/settings` — API Key & Webhook settings
- [x] Implementasi Protected Route (redirect ke `/login` jika belum auth)
- [x] Setup Supabase client (`createClient`)
- [x] Setup axios instance dengan base URL backend & interceptor auth header

### 3.2 Auth Pages
- [x] Halaman **Login** — form email + password (Supabase Auth)
- [x] Halaman **Register** — form email + password + konfirmasi
- [x] Implementasi `signIn()`, `signUp()`, `signOut()` via Supabase
- [x] Simpan & manage auth state (Supabase session listener)

### 3.3 Dashboard — Session Management
- [x] Tampilkan daftar sesi WhatsApp (card per sesi) dengan status badge
- [x] Tombol **"Tambah Sesi Baru"** → buat sesi & tampilkan modal QR
- [x] **Modal QR Code** — render QR menggunakan `qrcode.react`
  - [x] Subscribe ke Socket.io event `qr` untuk update QR real-time
  - [x] Auto-close modal saat event `ready` diterima
- [x] Status badge real-time (update via Socket.io events)
- [x] Tombol **"Hapus Sesi"** dengan konfirmasi dialog
- [x] Tombol **Copy Session ID** untuk digunakan di API
- [x] Tombol **Reconnect** untuk sesi yang terputus

### 3.4 Dashboard — Activity Log
- [x] Tampilkan tabel log pesan (inbound & outbound)
- [x] Kolom: Waktu, Sesi, Arah, Nomor, Tipe, Status
- [x] Filter berdasarkan sesi, arah (inbound/outbound), tanggal
- [x] Pagination (infinite scroll atau paginasi halaman)

### 3.5 Dashboard — Settings
- [x] Tampilkan daftar API Key dengan label & status
- [x] Tombol **"Generate API Key Baru"** (tampilkan key plain-text sekali)
- [x] Tombol **"Revoke"** untuk menonaktifkan API Key
- [x] Form **konfigurasi Webhook URL** per sesi
- [x] Tombol **"Test Webhook"** (kirim dummy payload ke URL)

### 3.6 Socket.io Integration
- [x] Setup `socket.io-client` koneksi ke backend
- [x] Emit `join_session` saat user membuka dashboard sesi tertentu
- [x] Handle event `qr` → update state QR Code
- [x] Handle event `ready` → update status sesi di UI
- [x] Handle event `authenticated` → update status sesi di UI
- [x] Handle event `auth_failure` → tampilkan error & prompt scan ulang
- [x] Handle event `disconnected` → update status sesi di UI + notifikasi toast

---

## 🐳 PHASE 4 — Deployment

### 4.1 Docker & VPS
- [ ] Test `docker-compose up --build` di lokal
- [ ] Pastikan sesi WA tidak hilang saat `docker-compose restart`
- [ ] Setup VPS (Ubuntu 22.04) — install Docker & Docker Compose
- [ ] Upload project ke VPS (via SCP atau Git)
- [ ] Konfigurasi file `.env` di VPS
- [ ] Jalankan `docker-compose up -d` di VPS
- [ ] Setup **Nginx reverse proxy** di host VPS (opsional, port 80/443)
- [ ] Setup **SSL/TLS** dengan Let's Encrypt + Certbot

### 4.2 Testing & QA
- [ ] Test end-to-end: scan QR → kirim pesan via API → cek log di dashboard
- [ ] Test webhook delivery dengan endpoint lokal (ngrok / Webhook.site)
- [ ] Test penanganan sesi putus (disconnect ponsel) & reconnect
- [ ] Test rate limiter (pastikan request berlebih ditolak)
- [ ] Test RLS Supabase (user A tidak bisa akses data user B)
- [ ] Test API Key authentication (valid key vs invalid key)

---

## 📋 Backlog (Phase Berikutnya)

- [ ] Bulk messaging dengan antrian (BullMQ + Redis)
- [ ] Notifikasi email saat sesi terputus (Resend / SMTP)
- [ ] Halaman monitoring real-time (jumlah pesan per jam, grafik)
- [ ] Multi-tenant dengan tier Free/Pro/Business
- [ ] Billing & subscription
- [ ] Rate limit per sesi (tidak hanya per API key)
- [ ] Import kontak dari CSV untuk blast pesan

---

## 📊 Progress Summary

| Phase | Total Task | Selesai | Progress |
|---|---|---|---|
| Phase 1 — Setup | ~17 | 10 | ~59% |
| Phase 2 — Backend | ~40 | 40 | ✅ 100% |
| Phase 3 — Frontend | ~30 | 30 | ✅ 100% |
| Phase 4 — Deployment | ~12 | 0 | 0% |
| **Total** | **~99** | **80** | **~81%** |
