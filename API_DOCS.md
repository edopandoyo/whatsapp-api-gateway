# 📖 WebWA Gateway — Dokumentasi API

> **Versi:** v1.0.0  
> **Base URL:** `https://backend-wa-api.masedo.my.id`

WebWA Gateway menyediakan REST API untuk mengirim dan menerima pesan WhatsApp secara terprogram. Semua endpoint menggunakan format JSON.

---

## Informasi Umum

| Item | Nilai |
|---|---|
| **Base URL** | `https://backend-wa-api.masedo.my.id` |
| **Format** | `application/json` |
| **Real-time** | Socket.io v4 |
| **Autentikasi** | `x-api-key` header |

---

## Alur Integrasi

1. **Buat Sesi** — Login ke dashboard, hubungkan nomor WhatsApp via QR Code.
2. **Generate API Key** — Buat API Key di halaman Pengaturan. Simpan key dengan aman.
3. **Kirim Pesan** — Gunakan API Key di header `x-api-key` untuk memanggil endpoint.
4. **Terima Pesan** — Konfigurasi Webhook URL untuk menerima event pesan masuk.

---

## Struktur Response

Semua response mengikuti format berikut:

```json
// Sukses
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": "Pesan error yang menjelaskan masalah."
}
```

---

## Daftar Isi

- [Autentikasi](#autentikasi)
- [Kirim Pesan Teks](#kirim-pesan-teks)
- [Kirim Media](#kirim-media)
- [Kirim Bulk](#kirim-bulk)
- [Manajemen Sesi](#manajemen-sesi)
- [Webhooks](#webhooks)
- [Kode Error](#kode-error)

---

## Autentikasi

API eksternal menggunakan API Key yang dikirim via header `x-api-key`.

> **💡 Cara mendapatkan API Key**  
> Buka **Dashboard → Pengaturan → API Keys**, klik *"Buat API Key"*, beri label, lalu salin key yang muncul. Key hanya ditampilkan **sekali** — simpan segera.

> ⚠️ **Peringatan:** Jangan pernah menyimpan API Key di kode frontend atau repository publik.

### Header Autentikasi

```http
POST /api/v1/messages/text HTTP/1.1
Host: backend-wa-api.masedo.my.id
x-api-key: wa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Contoh dengan cURL

```bash
curl -X POST https://backend-wa-api.masedo.my.id/api/v1/messages/text \
  -H "x-api-key: wa_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "YOUR_SESSION_ID", "to": "6281234567890", "text": "Halo!"}'
```

### Contoh dengan JavaScript

```javascript
const response = await fetch('https://backend-wa-api.masedo.my.id/api/v1/messages/text', {
  method: 'POST',
  headers: {
    'x-api-key': 'wa_YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id: 'YOUR_SESSION_ID',
    to: '6281234567890',
    text: 'Halo dari integrasi saya!',
  }),
});

const result = await response.json();
console.log(result);
```

### Error Autentikasi

```json
// 401 — API Key tidak disertakan
{ "success": false, "error": "API Key tidak ditemukan." }

// 403 — API Key tidak valid atau nonaktif
{ "success": false, "error": "API Key tidak valid." }
```

---

## Kirim Pesan Teks

Mengirim pesan teks ke satu nomor WhatsApp.

**`POST /api/v1/messages/text`**

### Request Body

| Parameter | Tipe | Status | Deskripsi |
|---|---|---|---|
| `session_id` | `string (uuid)` | **wajib** | UUID sesi WhatsApp. Dapatkan dari dashboard → Sesi. |
| `to` | `string` | **wajib** | Nomor tujuan format internasional (628xxx atau 08xxx) |
| `text` | `string` | **wajib** | Isi pesan teks yang akan dikirim |

### Contoh Request

```http
POST /api/v1/messages/text
x-api-key: wa_YOUR_API_KEY
Content-Type: application/json

{
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "to": "6281234567890",
  "text": "Halo! Pesanan Anda #12345 telah dikonfirmasi."
}
```

### Contoh Response

```json
{
  "success": true,
  "data": {
    "id": "3EB0XXXXXXXXXXXXXX",
    "to": "6281234567890@c.us",
    "type": "text"
  }
}
```

### Contoh dengan cURL

```bash
curl -X POST \
  https://backend-wa-api.masedo.my.id/api/v1/messages/text \
  -H "x-api-key: wa_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68", "to": "6281234567890", "text": "Halo dari sistem saya!"}'
```

### Contoh dengan JavaScript

```javascript
const res = await fetch('https://backend-wa-api.masedo.my.id/api/v1/messages/text', {
  method: 'POST',
  headers: {
    'x-api-key': 'wa_YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id: 'f6e624fb-24eb-4f3e-a15f-d22280b3bf68',
    to: '6281234567890',
    text: 'Notifikasi dari sistem Anda.',
  }),
});
const { success, data } = await res.json();
```

---

## Kirim Media

Mengirim gambar, dokumen, atau file lain. Mendukung pengiriman via URL atau base64.

**`POST /api/v1/messages/media`**

### Request Body

| Parameter | Tipe | Status | Deskripsi |
|---|---|---|---|
| `session_id` | `string (uuid)` | **wajib** | UUID sesi WhatsApp. Dapatkan dari dashboard → Sesi. |
| `to` | `string` | **wajib** | Nomor tujuan format internasional (628xxx atau 08xxx) |
| `mediaUrl` | `string` | opsional | URL publik file media (gunakan ini atau base64) |
| `base64` | `string` | opsional | String base64 dari file (gunakan ini atau mediaUrl) |
| `mimetype` | `string` | **wajib** | MIME type file, mis: `image/jpeg`, `application/pdf`, `image/png` |
| `filename` | `string` | opsional | Nama file yang ditampilkan ke penerima |
| `caption` | `string` | opsional | Keterangan di bawah media |

### Kirim via URL

```json
{
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "to": "6281234567890",
  "mediaUrl": "https://example.com/invoice.pdf",
  "mimetype": "application/pdf",
  "filename": "Invoice-12345.pdf",
  "caption": "Berikut invoice Anda."
}
```

### Kirim via Base64

```json
{
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "to": "6281234567890",
  "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "mimetype": "image/jpeg",
  "filename": "foto.jpg",
  "caption": "Foto produk terbaru!"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "3EB0XXXXXXXXXXXXXX",
    "to": "6281234567890@c.us",
    "type": "media"
  }
}
```

### Contoh dengan cURL

```bash
curl -X POST \
  https://backend-wa-api.masedo.my.id/api/v1/messages/media \
  -H "x-api-key: wa_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68", "to": "6281234567890", "mediaUrl": "https://example.com/logo.png", "mimetype": "image/png", "caption": "Logo Kami"}'
```

### Contoh dengan JavaScript

```javascript
const res = await fetch('https://backend-wa-api.masedo.my.id/api/v1/messages/media', {
  method: 'POST',
  headers: {
    'x-api-key': 'wa_YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id: 'f6e624fb-24eb-4f3e-a15f-d22280b3bf68',
    to: '6281234567890',
    mediaUrl: 'https://example.com/logo.png',
    mimetype: 'image/png',
    caption: 'Logo Kami',
  }),
});
const { success, data } = await res.json();
```

---

## Kirim Bulk

Mengirim pesan ke banyak nomor sekaligus. Maksimum **100 nomor** per request.
Delay **1.2 detik** antar pesan untuk menghindari deteksi spam.

**`POST /api/v1/messages/bulk`**

> ⚠️ **Perhatian:** Pengiriman bulk memerlukan waktu. Untuk 100 pesan, estimasi waktu ~2 menit. Gunakan timeout yang sesuai.

### Request Body

| Parameter | Tipe | Status | Deskripsi |
|---|---|---|---|
| `session_id` | `string (uuid)` | **wajib** | UUID sesi WhatsApp. Dapatkan dari dashboard → Sesi. |
| `messages` | `array` | **wajib** | Array objek pesan, maks 100 item |
| `messages[].to` | `string` | **wajib** | Nomor tujuan |
| `messages[].text` | `string` | **wajib** | Isi pesan teks |

### Contoh Request

```json
{
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "messages": [
    { "to": "6281234567890", "text": "Halo Budi, promo hari ini 20% off!" },
    { "to": "6289876543210", "text": "Halo Ani, promo hari ini 20% off!" },
    { "to": "6281111222333", "text": "Halo Sari, promo hari ini 20% off!" }
  ]
}
```

### Contoh Response

```json
{
  "success": true,
  "data": {
    "total": 3,
    "results": [
      { "to": "6281234567890@c.us", "status": "sent",   "id": "3EB0XX..." },
      { "to": "6289876543210@c.us", "status": "sent",   "id": "3EB0XY..." },
      { "to": "6281111222333@c.us", "status": "failed", "error": "Nomor tidak terdaftar di WhatsApp" }
    ]
  }
}
```

### Contoh dengan cURL

```bash
curl -X POST \
  https://backend-wa-api.masedo.my.id/api/v1/messages/bulk \
  -H "x-api-key: wa_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
    "messages": [
      { "to": "6281234567890", "text": "Halo Budi!" },
      { "to": "6289876543210", "text": "Halo Ani!" }
    ]
  }'
```

### Contoh dengan JavaScript

```javascript
const res = await fetch('https://backend-wa-api.masedo.my.id/api/v1/messages/bulk', {
  method: 'POST',
  headers: {
    'x-api-key': 'wa_YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id: 'f6e624fb-24eb-4f3e-a15f-d22280b3bf68',
    messages: [
      { to: '6281234567890', text: 'Halo Budi!' },
      { to: '6289876543210', text: 'Halo Ani!' },
    ],
  }),
});
const { success, data } = await res.json();
```

---

## Manajemen Sesi

Endpoint internal untuk mengelola sesi WhatsApp. Memerlukan autentikasi **JWT (Bearer Token)**.

### `GET /api/internal/sessions`

Ambil daftar semua sesi milik akun.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
      "name": "Nomor CS 1",
      "status": "connected",
      "phone_number": "6281234567890",
      "webhook_url": "https://myapp.com/webhook",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

---

### `POST /api/internal/sessions`

Buat sesi baru. QR Code akan dikirim via Socket.io.

**Request:**

```json
{ "name": "Nomor CS 2", "webhook_url": "https://myapp.com/webhook" }
```

**Response:**

```json
{ "success": true, "data": { "id": "...", "status": "pending" } }
```

---

### `DELETE /api/internal/sessions/:id`

Logout dan hapus sesi beserta datanya.

**Response:**

```json
{ "success": true, "message": "Sesi berhasil dihapus." }
```

---

### `POST /api/internal/sessions/:id/reconnect`

Re-inisialisasi sesi yang terputus.

**Response:**

```json
{ "success": true, "message": "Proses reconnect dimulai." }
```

---

## Webhooks

Server akan mengirim **HTTP POST** ke URL webhook Anda setiap ada event baru.
Sistem akan **retry 3x** dengan backoff eksponensial jika endpoint gagal.

### Konfigurasi Webhook

Atur Webhook URL di halaman **Pengaturan → Webhook URLs**, atau via API:

```http
PATCH /api/internal/sessions/:id
Authorization: Bearer YOUR_JWT_TOKEN

{ "webhook_url": "https://your-app.com/webhook/whatsapp" }
```

### Event: Pesan Masuk

```json
{
  "event": "message.received",
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "timestamp": "2026-03-20T10:30:00.000Z",
  "data": {
    "id": "3EB0XXXXXXXXXXXXXX",
    "from": "6281234567890@c.us",
    "to": "6289999999999@c.us",
    "body": "Halo, saya ingin bertanya tentang produk.",
    "type": "chat",
    "hasMedia": false
  }
}
```

### Retry Logic

| Percobaan | Delay |
|---|---|
| Attempt 1 | Langsung |
| Attempt 2 | Setelah 1 detik |
| Attempt 3 | Setelah 5 detik |
| Attempt 4 | Setelah 15 detik |

### Validasi Webhook

Pastikan endpoint Anda mengembalikan **HTTP 2xx dalam 10 detik**. Contoh handler Express:

```javascript
app.post('/webhook/whatsapp', (req, res) => {
  const { event, session_id, data } = req.body;

  if (event === 'message.received') {
    console.log(`Pesan dari ${data.from}: ${data.body}`);
    // proses pesan di sini...
  }

  res.status(200).json({ received: true }); // wajib 2xx
});
```

---

## Kode Error

Semua error dikembalikan dalam format JSON dengan field `success: false` dan `error`.

| HTTP Status | Kode | Penyebab |
|---|---|---|
| `400` | Bad Request | Field wajib tidak ada atau format tidak valid |
| `401` | Unauthorized | API Key tidak disertakan di header |
| `403` | Forbidden | API Key tidak valid, nonaktif, atau tidak punya akses |
| `404` | Not Found | Sesi tidak ditemukan atau bukan milik Anda |
| `409` | Conflict | Sesi belum terhubung, status bukan `connected` |
| `429` | Too Many Requests | Rate limit tercapai, coba lagi setelah beberapa saat |
| `500` | Internal Server Error | Kesalahan server, coba lagi atau hubungi support |

### Contoh Error Response

```json
// 409 — Sesi belum terhubung
{
  "success": false,
  "error": "Sesi belum terhubung. Status saat ini: authenticating"
}

// 429 — Rate limit
{
  "success": false,
  "error": "Terlalu banyak request. Coba lagi dalam 60 detik."
}

// 400 — Validasi gagal
{
  "success": false,
  "error": "Field \"to\" dan \"text\" wajib diisi."
}
```

### Rate Limiting

Setiap API Key dibatasi **100 request per menit**. Jika melebihi batas, server mengembalikan HTTP 429 dengan header:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711000060
```

---

*Dokumentasi ini dibuat berdasarkan WebWA Gateway API v1.0.0*
