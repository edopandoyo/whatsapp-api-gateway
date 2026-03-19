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
- [ ] Setup Express server dengan `helmet`, `cors`, `morgan` (logger)
- [ ] Integrasi Socket.io pada Express server
- [ ] Buat middleware `authenticateApiKey` (validasi `x-api-key` → query tabel `api_keys`)
- [ ] Buat middleware `authenticateJWT` (validasi Supabase Bearer Token)
- [ ] Buat middleware `rateLimiter` dengan `express-rate-limit`
- [ ] Setup error handler global (catch-all)
- [ ] Setup environment config loader (`dotenv`)

### 2.2 WhatsApp Session Manager
- [ ] Buat `SessionManager` class/module untuk mengelola multiple WA client instances
- [ ] Implementasi `createSession(sessionId)` — init `whatsapp-web.js` client dengan `LocalAuth`
- [ ] Implementasi `deleteSession(sessionId)` — logout & destroy client
- [ ] Implementasi `getSession(sessionId)` — ambil client aktif dari Map
- [ ] Implementasi `getAllSessions()` — list semua active sessions
- [ ] Handle event `qr` → emit ke Socket.io room sesi terkait
- [ ] Handle event `ready` → update status di Supabase + emit ke Socket.io
- [ ] Handle event `authenticated` → emit ke Socket.io
- [ ] Handle event `auth_failure` → update status di Supabase + emit ke Socket.io
- [ ] Handle event `disconnected` → update status di Supabase + emit ke Socket.io
- [ ] Handle event `message` (pesan masuk) → log ke DB + trigger webhook
- [ ] Konfigurasi Puppeteer args: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`
- [ ] Restore active sessions dari Supabase saat server restart

### 2.3 REST API — External Endpoints
- [ ] `POST /api/v1/send-message` — kirim pesan teks
  - [ ] Validasi request body (`session_id`, `to`, `message`)
  - [ ] Validasi sesi aktif & status `connected`
  - [ ] Format nomor tujuan (tambahkan `@c.us` jika perlu)
  - [ ] Kirim pesan via `client.sendMessage()`
  - [ ] Insert log ke tabel `message_logs` (status: `sent`)
  - [ ] Return response dengan `message_id`
- [ ] `POST /api/v1/send-media` — kirim media (gambar/dokumen)
  - [ ] Validasi request body (`session_id`, `to`, `media_url`, `caption`)
  - [ ] Download media dari URL & buat `MessageMedia` object
  - [ ] Kirim media via `client.sendMessage()`
  - [ ] Insert log ke tabel `message_logs`
  - [ ] Return response dengan `message_id`

### 2.4 REST API — Internal Endpoints (Dashboard)
- [ ] `POST /api/internal/sessions` — buat sesi baru
  - [ ] Insert ke tabel `sessions` (status: `pending`)
  - [ ] Panggil `SessionManager.createSession()`
- [ ] `DELETE /api/internal/sessions/:id` — hapus sesi
  - [ ] Panggil `SessionManager.deleteSession()`
  - [ ] Update status di tabel `sessions` (status: `disconnected`)
- [ ] `GET /api/internal/sessions` — list sesi user
  - [ ] Query tabel `sessions` berdasarkan `user_id` dari JWT
- [ ] `GET /api/internal/logs` — riwayat pesan
  - [ ] Query tabel `message_logs` dengan filter & pagination
- [ ] `POST /api/internal/api-keys` — buat API Key baru
  - [ ] Generate random API Key string
  - [ ] Hash API Key sebelum disimpan (SHA-256 / bcrypt)
  - [ ] Return API Key plain-text HANYA sekali (saat dibuat)
- [ ] `DELETE /api/internal/api-keys/:id` — nonaktifkan API Key
  - [ ] Update `is_active = false`

### 2.5 Webhook Delivery
- [ ] Buat `WebhookService` module
- [ ] Implementasi `deliverWebhook(webhookUrl, payload)` menggunakan `axios`
- [ ] Implementasi retry logic (3x retry, exponential backoff)
- [ ] Log hasil pengiriman webhook (sukses/gagal) ke `message_logs`

---

## 🎨 PHASE 3 — Frontend Development

### 3.1 Setup & Routing
- [ ] Setup React Router (`react-router-dom`) dengan route:
  - `/login` — halaman login
  - `/register` — halaman registrasi
  - `/dashboard` — halaman utama (protected)
  - `/dashboard/sessions` — manajemen sesi
  - `/dashboard/logs` — activity log
  - `/dashboard/settings` — API Key & Webhook settings
- [ ] Implementasi Protected Route (redirect ke `/login` jika belum auth)
- [ ] Setup Supabase client (`createClient`)
- [ ] Setup axios instance dengan base URL backend & interceptor auth header

### 3.2 Auth Pages
- [ ] Halaman **Login** — form email + password (Supabase Auth)
- [ ] Halaman **Register** — form email + password + konfirmasi
- [ ] Implementasi `signIn()`, `signUp()`, `signOut()` via Supabase
- [ ] Simpan & manage auth state (Supabase session listener)

### 3.3 Dashboard — Session Management
- [ ] Tampilkan daftar sesi WhatsApp (card per sesi) dengan status badge
- [ ] Tombol **"Tambah Sesi Baru"** → buat sesi & tampilkan modal QR
- [ ] **Modal QR Code** — render QR menggunakan `qrcode.react`
  - [ ] Subscribe ke Socket.io event `qr` untuk update QR real-time
  - [ ] Auto-close modal saat event `ready` diterima
- [ ] Status badge real-time (update via Socket.io events)
- [ ] Tombol **"Hapus Sesi"** dengan konfirmasi dialog
- [ ] Tombol **Copy Session ID** untuk digunakan di API

### 3.4 Dashboard — Activity Log
- [ ] Tampilkan tabel log pesan (inbound & outbound)
- [ ] Kolom: Waktu, Sesi, Arah, Nomor, Tipe, Status
- [ ] Filter berdasarkan sesi, arah (inbound/outbound), tanggal
- [ ] Pagination (infinite scroll atau paginasi halaman)

### 3.5 Dashboard — Settings
- [ ] Tampilkan daftar API Key dengan label & status
- [ ] Tombol **"Generate API Key Baru"** (tampilkan key plain-text sekali)
- [ ] Tombol **"Revoke"** untuk menonaktifkan API Key
- [ ] Form **konfigurasi Webhook URL** per sesi
- [ ] Tombol **"Test Webhook"** (kirim dummy payload ke URL)

### 3.6 Socket.io Integration
- [ ] Setup `socket.io-client` koneksi ke backend
- [ ] Emit `join_session` saat user membuka dashboard sesi tertentu
- [ ] Handle event `qr` → update state QR Code
- [ ] Handle event `ready` → update status sesi di UI
- [ ] Handle event `authenticated` → update status sesi di UI
- [ ] Handle event `auth_failure` → tampilkan error & prompt scan ulang
- [ ] Handle event `disconnected` → update status sesi di UI + notifikasi toast

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
| Phase 1 — Setup | ~17 | 0 | 0% |
| Phase 2 — Backend | ~40 | 0 | 0% |
| Phase 3 — Frontend | ~30 | 0 | 0% |
| Phase 4 — Deployment | ~12 | 0 | 0% |
| **Total** | **~99** | **0** | **0%** |
