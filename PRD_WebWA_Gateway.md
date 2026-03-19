# 📱 Product Requirements Document (PRD)
# WebWA Gateway — WhatsApp API Gateway

> **Status:** Draft  
> **Versi:** 1.0.0  
> **Tanggal:** 19 Maret 2026  
> **Tim:** Masedo Studio

---

## 📋 Daftar Isi

1. [Gambaran Umum Produk](#1-gambaran-umum-produk)
2. [Tech Stack](#2-tech-stack)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Fitur Utama](#4-fitur-utama)
5. [Skema Database](#5-skema-database-supabase-postgresql)
6. [Spesifikasi API](#6-spesifikasi-api-expressjs)
7. [Event Socket.io](#7-event-socketio)
8. [Strategi Deployment](#8-strategi-deployment-docker--vps)
9. [Potensi Risiko & Mitigasi](#9-potensi-risiko--mitigasi)
10. [Roadmap (Opsional)](#10-roadmap-opsional)

---

## 1. Gambaran Umum Produk

| Atribut | Detail |
|---|---|
| **Nama Produk** | WebWA Gateway *(Nama Sementara)* |
| **Tipe Produk** | API Gateway / SaaS Platform |
| **Target Pengguna** | Developer, Tim IT, Bisnis yang membutuhkan notifikasi WhatsApp terprogram |

### 📌 Deskripsi

**WebWA Gateway** adalah layanan API Gateway berbasis web yang memungkinkan pengguna untuk menghubungkan nomor WhatsApp mereka melalui pemindaian QR Code dan mengirim/menerima pesan WhatsApp secara terprogram melalui **REST API** dan **Webhooks**.

### 🎯 Tujuan

Menyediakan infrastruktur pengiriman pesan WhatsApp yang:
- ✅ **Stabil** — menggunakan session persistence via volume Docker
- ✅ **Multi-sesi** — mendukung beberapa nomor WhatsApp secara bersamaan
- ✅ **Mudah diintegrasikan** — REST API standar dengan autentikasi API Key
- ✅ **Real-time** — notifikasi status via Socket.io

### 💡 Use Case Utama

- Pengiriman **notifikasi** otomatis (order, pembayaran, dll.)
- Pengiriman **OTP** via WhatsApp
- **Customer Service** otomatis dengan webhook
- **Marketing blast** dengan kontrol rate-limit

---

## 2. Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Core Engine** | `whatsapp-web.js` | Berbasis Puppeteer (Chromium headless) |
| **Backend & API** | `Express.js` (Node.js) | REST API server |
| **Frontend / Dashboard** | `React.js` | SPA interaktif |
| **Database & Auth** | `Supabase` | PostgreSQL + GoTrue Auth |
| **Real-time** | `Socket.io` | Sinkronisasi QR Code & status sesi |
| **Containerization** | `Docker & Docker Compose` | Packaging & deployment |
| **Web Server (Frontend)** | `Nginx Alpine` | Serve static React build |

---

## 3. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                        USER / BROWSER                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
          ┌──────────────▼──────────────┐
          │      Frontend (React.js)     │
          │  - Dashboard Manajemen Sesi  │
          │  - Render QR Code            │
          │  - Auth via Supabase SDK     │
          └──────┬──────────────┬────────┘
                 │ REST API     │ Socket.io (real-time)
          ┌──────▼──────────────▼────────┐
          │      Backend (Express.js)     │
          │  - Manage WA Client Instances │
          │  - REST Endpoint Eksternal    │
          │  - Validasi API Key           │
          │  - Logging ke Supabase        │
          └──────┬──────────────┬────────┘
                 │              │
     ┌───────────▼──┐    ┌──────▼───────────────┐
     │  whatsapp-   │    │   Socket.io Server   │
     │  web.js      │    │  (QR, ready, disc..) │
     │  (Puppeteer) │    └──────────────────────┘
     └──────────────┘
                 │
          ┌──────▼──────────────────────┐
          │        Supabase              │
          │  - PostgreSQL (Data)         │
          │  - GoTrue (Auth)             │
          │  - Row Level Security (RLS)  │
          └─────────────────────────────┘
```

### Deskripsi Komponen

**Frontend (React.js)**
- Dashboard interaktif untuk manajemen sesi WhatsApp
- Mengambil data dari Express.js via REST API
- Menerima update status & QR Code secara real-time via Socket.io
- Autentikasi login ditangani langsung oleh Supabase Auth SDK

**Backend (Express.js)**
- Mengelola instance klien `whatsapp-web.js` secara programatik
- Menyediakan endpoint REST untuk klien eksternal mengirim pesan
- Berkomunikasi dengan Supabase untuk validasi API Key dan logging
- Menangani autentikasi Bearer Token (internal) dan `x-api-key` (eksternal)

**Real-time Server (Socket.io)**
- Terpasang (embedded) pada server Express
- Mem-broadcast QR Code baru, status koneksi, dan event pesan masuk ke dashboard React

**Database (Supabase)**
- Menyimpan profil pengguna, daftar sesi, log pesan, dan konfigurasi webhook
- Menggunakan Row Level Security (RLS) untuk isolasi data per pengguna

---

## 4. Fitur Utama

### 4.1 Manajemen Sesi (Multi-Device)

| Fitur | Deskripsi |
|---|---|
| **Generate QR Code** | Menampilkan QR Code di dashboard secara real-time via Socket.io |
| **Status Sesi** | Memantau status setiap sesi: `connected`, `disconnected`, `pending`, `authenticating` |
| **Rename Sesi** | Memberikan nama/label pada setiap sesi untuk kemudahan identifikasi |
| **Hapus Sesi** | Memutus koneksi (logout) dan menghapus state sesi dari server (`LocalAuth`) |

### 4.2 REST API (Outbound Messaging)

| Fitur | Deskripsi |
|---|---|
| **Send Text** | Mengirim pesan teks ke nomor tujuan tertentu |
| **Send Media** | Mengirim gambar/dokumen via URL atau base64 |
| **Send Bulk** *(Roadmap)* | Pengiriman pesan ke banyak nomor sekaligus dengan antrian |
| **Authentication** | Validasi via `x-api-key` header (ekstrernal) atau Supabase JWT (internal) |

### 4.3 Webhooks (Inbound Events)

| Fitur | Deskripsi |
|---|---|
| **Pesan Masuk** | Meneruskan pesan masuk (`message_create`) ke URL webhook pengguna |
| **Status Update** | Meneruskan pembaruan status pesan (Terkirim, Dibaca) |
| **Retry Mechanism** | Pengiriman ulang jika webhook endpoint tidak merespons (timeout/5xx) |

### 4.4 Dashboard Pengguna

- 🔐 **Auth** — Registrasi & Login via Supabase Auth (email + password)
- 📱 **Session List** — Tampilkan daftar sesi WhatsApp aktif dengan status terkini
- 📜 **Activity Log** — Riwayat API call dan pesan masuk/keluar dengan filter
- ⚙️ **Settings** — Kelola API Key dan konfigurasi URL Webhook per sesi

---

## 5. Skema Database (Supabase PostgreSQL)

### Tabel: `users` *(Extended dari Supabase Auth)*

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | Primary Key, dari Supabase Auth |
| `email` | `text` | Email pengguna |
| `full_name` | `text` | Nama lengkap (opsional) |
| `created_at` | `timestamptz` | Waktu registrasi |

---

### Tabel: `api_keys`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | Primary Key |
| `user_id` | `uuid` | Foreign Key → `users.id` |
| `api_key` | `text` | API Key yang di-hash (tidak disimpan plain text) |
| `label` | `text` | Nama/label API Key |
| `is_active` | `boolean` | Status aktif/nonaktif |
| `last_used_at` | `timestamptz` | Waktu terakhir digunakan |
| `created_at` | `timestamptz` | Waktu pembuatan |

> ⚠️ **Security Note:** `api_key` sebaiknya disimpan dalam bentuk **hash** (bcrypt/SHA-256) untuk keamanan.

---

### Tabel: `sessions`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | Primary Key |
| `user_id` | `uuid` | Foreign Key → `users.id` |
| `session_name` | `text` | Nama/label sesi (e.g., "Nomor CS 1") |
| `phone_number` | `text` | Nomor WA yang terhubung (diisi setelah `ready`) |
| `status` | `text` | Enum: `pending`, `authenticating`, `connected`, `disconnected` |
| `webhook_url` | `text` | URL tujuan untuk event inbound |
| `created_at` | `timestamptz` | Waktu pembuatan |
| `updated_at` | `timestamptz` | Waktu update terakhir |

---

### Tabel: `message_logs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | Primary Key |
| `session_id` | `uuid` | Foreign Key → `sessions.id` |
| `direction` | `text` | Enum: `outbound`, `inbound` |
| `recipient` | `text` | Nomor tujuan / pengirim |
| `type` | `text` | Enum: `text`, `image`, `document`, `video` |
| `status` | `text` | Enum: `queued`, `sent`, `delivered`, `read`, `failed` |
| `payload` | `jsonb` | Isi pesan (teks atau metadata media) |
| `created_at` | `timestamptz` | Waktu pesan dibuat/diterima |

---

## 6. Spesifikasi API (Express.js)

### Autentikasi

| Tipe Endpoint | Metode Auth |
|---|---|
| **Eksternal** (integrasi sistem lain) | Header `x-api-key: <API_KEY>` |
| **Internal** (dashboard React) | Header `Authorization: Bearer <SUPABASE_JWT>` |

---

### External Endpoints (Untuk Integrasi Sistem)

#### `POST /api/v1/send-message`

Mengirim pesan teks ke nomor WhatsApp tertentu.

**Request Headers:**
```
x-api-key: YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "uuid-sesi-anda",
  "to": "6281234567890",
  "message": "Halo, ini pesan dari WebWA Gateway!"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "message_id": "uuid-log-pesan",
  "status": "sent"
}
```

**Response `4xx/5xx`:**
```json
{
  "success": false,
  "error": "Session not found or disconnected."
}
```

---

#### `POST /api/v1/send-media`

Mengirim media (gambar/dokumen) ke nomor WhatsApp tertentu.

**Request Body:**
```json
{
  "session_id": "uuid-sesi-anda",
  "to": "6281234567890",
  "media_url": "https://example.com/gambar.jpg",
  "caption": "Ini keterangan gambar (opsional)"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "message_id": "uuid-log-pesan",
  "status": "sent"
}
```

---

### Internal Endpoints (Untuk Dashboard React)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/internal/sessions` | Membuat intent sesi baru (generate QR) |
| `DELETE` | `/api/internal/sessions/:id` | Logout & hapus sesi |
| `GET` | `/api/internal/sessions` | Mengambil daftar semua sesi milik user |
| `GET` | `/api/internal/logs` | Mengambil riwayat log pesan |
| `POST` | `/api/internal/api-keys` | Membuat API Key baru |
| `DELETE` | `/api/internal/api-keys/:id` | Menonaktifkan API Key |

---

## 7. Event Socket.io

Komunikasi real-time berfokus pada sinkronisasi state klien `whatsapp-web.js` dengan antarmuka React.

| Event | Direction | Payload | Deskripsi |
|---|---|---|---|
| `qr` | Server → Client | `{ session_id, qr_string }` | String QR Code untuk di-render (gunakan `qrcode.react`) |
| `ready` | Server → Client | `{ session_id, phone_number }` | WA Client berhasil terhubung dan siap |
| `authenticated` | Server → Client | `{ session_id }` | Sesi berhasil diautentikasi (sebelum `ready`) |
| `auth_failure` | Server → Client | `{ session_id, message }` | Autentikasi gagal, memerlukan scan ulang |
| `disconnected` | Server → Client | `{ session_id, reason }` | Sesi WA terputus dari ponsel utama |
| `message` | Server → Client | `{ session_id, from, body, type }` | Pesan masuk diterima sesi |
| `join_session` | Client → Server | `{ session_id }` | Client mendaftar untuk update sesi tertentu |

---

## 8. Strategi Deployment (Docker & VPS)

> Karena arsitektur ini melibatkan **Puppeteer (Chromium)** yang membutuhkan dependensi sistem operasi spesifik, containerization adalah **keharusan** untuk memastikan portabilitas dan konsistensi di VPS Ubuntu/Debian.

### 8.1 Dockerfile — Backend (Node.js + Puppeteer)

```dockerfile
FROM node:20-slim

# Install dependensi sistem untuk Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  fonts-liberation \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
```

### 8.2 Dockerfile — Frontend (React + Nginx)

```dockerfile
# --- Stage 1: Build React App ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 8.3 Docker Compose

```yaml
version: "3.9"

services:
  backend:
    build:
      context: ./backend
    container_name: webwa-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    volumes:
      - wa_sessions:/app/.wwebjs_auth  # Persist session data
    networks:
      - webwa-net

  frontend:
    build:
      context: ./frontend
    container_name: webwa-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - webwa-net

volumes:
  wa_sessions:  # Volume persisten untuk data sesi WA

networks:
  webwa-net:
    driver: bridge
```

### 8.4 File `.env` (Template)

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Config
PORT=3001
NODE_ENV=production
```

> 📁 **Catatan Penting:** Volume `wa_sessions` (`/app/.wwebjs_auth`) dipasang sebagai volume Docker agar **data sesi tidak hilang** saat container Backend di-restart atau di-update.

---

## 9. Potensi Risiko & Mitigasi

| # | Risiko | Tingkat | Mitigasi |
|---|---|---|---|
| 1 | **Pemblokiran Nomor WA** | 🔴 Tinggi | Tambahkan **rate-limiting** di Express.js (misal: maks 100 pesan/jam/sesi). Informasikan risiko secara jelas di dashboard. Hindari pengiriman spam. |
| 2 | **Penggunaan RAM Tinggi** | 🟡 Sedang | Setiap instance buka Chromium. Gunakan argumen `--no-sandbox`, `--disable-setuid-sandbox`. Alokasikan RAM + Swap memadai di VPS (minimal 1GB RAM per 3–5 sesi aktif). |
| 3 | **Perubahan API WhatsApp** | 🟡 Sedang | Monitor repo `whatsapp-web.js` secara berkala. Siapkan proses update dependency terjadwal. |
| 4 | **Kebocoran API Key** | 🟠 Sedang | Simpan API Key dalam format hash. Beri fitur revoke/regenerate key. Log setiap akses API Key. |
| 5 | **Downtime Sesi** | 🟡 Sedang | Implementasikan reconnect otomatis dan notifikasi email/dashboard jika sesi terputus. |
| 6 | **Abuse / Misuse** | 🟠 Sedang | Tambahkan Terms of Service yang jelas. Batasi jumlah sesi per user di tier Free. |

---

## 10. Roadmap (Opsional)

### Phase 1 — MVP (Target: ~4 Minggu)
- [x] Setup monorepo (Backend + Frontend)
- [ ] Integrasi `whatsapp-web.js` dengan session persistence
- [ ] REST API: send-message & send-media
- [ ] Dashboard: Login, QR Scan, Session List, Basic Log
- [ ] Docker Compose deployment

### Phase 2 — Stabilization (Target: ~2 Minggu)
- [ ] Webhook delivery dengan retry mechanism
- [ ] Rate limiting per API Key
- [ ] Notifikasi email jika sesi terputus
- [ ] Activity log dengan filter & pagination

### Phase 3 — Scale & Monetize (Target: TBD)
- [ ] Multi-tenant dengan tier Free/Pro/Business
- [ ] Billing & subscription via Stripe/Midtrans
- [ ] Bulk messaging dengan antrian (BullMQ/Redis)
- [ ] REST API versi v2 dengan fitur tambahan
- [ ] Monitoring & alerting (Uptime Kuma / Grafana)

---

## 📎 Referensi

- [whatsapp-web.js Documentation](https://docs.wwebjs.dev/)
- [Supabase Docs](https://supabase.com/docs)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Puppeteer Troubleshooting](https://pptr.dev/troubleshooting)

---

*Dokumen ini adalah Property Masedo Studio. Versi terbaru selalu mengacu pada repository internal.*
