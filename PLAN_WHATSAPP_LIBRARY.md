# PLAN: WhatsApp API Gateway → Library/SDK untuk Integrasi Photobooth

## 📋 Ringkasan Eksekutif

Mengubah WhatsApp API Gateway yang saat ini berupa aplikasi monolitik (backend Express + frontend React + library `whatsapp-web-api-gateway`) menjadi **SDK/library yang dapat dipasang di project lain**, khususnya project **Photobooth**. Tujuan akhir: setiap **vendor user photobooth** dapat:

1. **Scan QR code WhatsApp** langsung di dashboard photobooth mereka
2. Setelah terhubung, **mengirim hasil sesi photobooth** (gambar/foto) melalui sesi WhatsApp yang terhubung

---

## 🏗️ Arsitektur Saat Ini (Current State)

```
masedo-studio/
├── whatsapp-web-api-gateway/     # Library Baileys (whatsapp-web.js) - client WA
│   └── src/
│       ├── whatsapp-client.ts    # Wrapper @whiskeysockets/baileys
│       ├── types.ts              # Type definitions
│       └── index.ts              # Export
├── backend/                      # API Gateway (Express + TypeScript)
│   └── src/
│       ├── routes/               # auth, session, message, apiKey
│       ├── services/             # whatsapp, session, message, auth, apiKey
│       ├── middleware/           # auth (JWT), apiKeyAuth
│       ├── config/               # database, supabase
│       └── types/                # Type definitions
├── frontend/                     # Dashboard React (Vite + TypeScript)
│   └── src/
│       ├── pages/                # SessionsPage (QR scan), MessagesPage, dll
│       └── services/             # api.ts (HTTP client)
├── schema_v2.sql                 # Database schema (Supabase/PostgreSQL)
└── docker-compose.yml            # Deployment
```

### Alur API Saat Ini:
1. **Register** → `POST /api/auth/register`
2. **Login** → `POST /api/auth/login` → dapat JWT token
3. **Buat Sesi WA** → `POST /api/sessions` → dapat session ID
4. **Get QR Code** → `GET /api/sessions/:id/qr` → scan QR
5. **Buat API Key** → `POST /api/api-keys` → dapat API key
6. **Kirim Pesan** → `POST /api/messages/send` dengan `x-api-key` header + `sessionId`

### Teknologi:
- **Backend**: Express.js, TypeScript, JWT, Supabase (PostgreSQL)
- **WhatsApp**: `@whiskeysockets/baileys` (via `whatsapp-web-api-gateway`)
- **Frontend**: React, Vite, TypeScript
- **Database**: Supabase (PostgreSQL) - tabel: `users`, `sessions`, `api_keys`, `messages`

---

## 🎯 Tujuan & Persyaratan

### Functional Requirements:
1. **Vendor user photobooth** dapat membuat sesi WhatsApp dari dashboard photobooth
2. **QR code authentication** ditampilkan di dashboard photobooth (bukan dashboard WA Gateway terpisah)
3. Setelah WhatsApp terhubung, vendor dapat **mengirim foto hasil photobooth** ke nomor tujuan
4. Setiap vendor memiliki **sesi WhatsApp terisolasi** (multi-session, multi-tenant)
5. **Tidak perlu register/login terpisah** di WA Gateway — vendor sudah login di photobooth

### Non-Functional Requirements:
1. **SDK harus mudah dipasang** (`npm install` atau copy package)
2. **TypeScript support** dengan type definitions lengkap
3. **Dokumentasi lengkap** dengan contoh kode
4. **Backward compatible** — API Gateway tetap berjalan untuk pengguna existing
5. **Scalable** — mendukung banyak vendor dengan banyak sesi

---

## 📐 Arsitektur Target (Proposed)

### Opsi Arsitektur:

#### OPSI A: SDK Client + API Gateway Terpusat (RECOMMENDED) ⭐

```
┌─────────────────────────────────────────────────┐
│  Project Photobooth                              │
│  ┌───────────────────────────────────────────┐  │
│  │  Dashboard Vendor                         │  │
│  │  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │ QR Code UI  │  │ Send Photo UI   │    │  │
│  │  └──────┬──────┘  └────────┬────────┘    │  │
│  │         │                  │              │  │
│  │  ┌──────┴──────────────────┴────────┐    │  │
│  │  │   @masedo/wa-gateway-sdk         │    │  │
│  │  │   (npm package)                  │    │  │
│  │  │   - createSession()              │    │  │
│  │  │   - getQRCode()                  │    │  │
│  │  │   - getSessionStatus()           │    │  │
│  │  │   - sendMedia()                  │    │  │
│  │  │   - sendText()                   │    │  │
│  │  └──────────────┬───────────────────┘    │  │
│  └─────────────────┼────────────────────────┘  │
└────────────────────┼────────────────────────────┘
                     │ HTTPS (API Key)
                     ▼
┌─────────────────────────────────────────────────┐
│  WA API Gateway (Server Terpusat)               │
│  backend-wa-api.masedo.my.id                    │
│  ┌───────────────────────────────────────────┐  │
│  │  Express API                              │  │
│  │  - Multi-tenant session management       │  │
│  │  - QR code generation per vendor         │  │
│  │  - Message sending (text + media)        │  │
│  │  - API Key authentication                │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  WhatsApp Gateway (Baileys)               │  │
│  │  - Multiple WA clients per session       │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Supabase (PostgreSQL)                    │  │
│  │  - sessions, api_keys, messages           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Keunggulan Opsi A:**
- ✅ SDK ringan (hanya HTTP client), tidak perlu menjalankan Baileys di project photobooth
- ✅ WhatsApp session tetap terpusat (tidak perlu scan ulang jika photobooth restart)
- ✅ Mudah di-maintain — update WA Gateway tidak perlu update semua project client
- ✅ Skalabel — satu server WA Gateway melayani banyak project
- ✅ Aman — API key per vendor, session isolation
- ✅ Backward compatible — API Gateway existing tetap berjalan

**Kekurangan:**
- ⚠️ Membutuhkan koneksi internet ke server WA Gateway
- ⚠️ Server WA Gateway harus selalu online

#### OPSI B: Embedded Library (Baileys langsung di project photobooth)

```
┌─────────────────────────────────────────────────┐
│  Project Photobooth                              │
│  ┌───────────────────────────────────────────┐  │
│  │  @masedo/wa-gateway (npm package)         │  │
│  │  - Baileys WhatsApp client                │  │
│  │  - Session management (local file/DB)     │  │
│  │  - QR code generation                     │  │
│  │  - Send message/media                     │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Supabase Photobooth (DB sendiri)         │  │
│  │  - tabel wa_sessions                      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Keunggulan Opsi B:**
- ✅ Tidak butuh server terpusat — self-contained
- ✅ Tidak ada network dependency ke WA Gateway
- ✅ Full control di project photobooth

**Kekurangan:**
- ❌ Setiap project photobooth harus menjalankan Baileys (heavy)
- ❌ WhatsApp session hilang jika project restart (kecuali persist session)
- ❌ Update Baileys harus dilakukan di setiap project
- ❌ Tidak ada central monitoring/management
- ❌ Resource intensive jika banyak vendor

#### OPSI C: Hybrid (SDK + Optional Embedded)

Kombinasi Opsi A dan B — SDK bisa berkomunikasi dengan server terpusat ATAU menjalankan Baileys secara embedded (pilihan konfigurasi).

**Keunggulan:**
- ✅ Fleksibel — bisa terpusat atau embedded

**Kekurangan:**
- ❌ Kompleksitas tinggi — maintain 2 mode
- ❌ Lebih sulit di-test dan di-document

---

## ✅ REKOMENDASI: OPSI A (SDK Client + API Gateway Terpusat)

**Alasan:**
1. Paling sesuai dengan arsitektur existing (API Gateway sudah berjalan)
2. SDK ringan, mudah dipasang di project photobooth
3. WhatsApp session tetap persist di server terpusat
4. Backward compatible dengan pengguna existing
5. Paling mudah di-maintain dan di-scale

---

## 📝 Detail Implementasi OPSI A

### Phase 1: Persiapan SDK Package

#### 1.1 Struktur Package SDK

```
packages/wa-gateway-sdk/
├── package.json              # @masedo/wa-gateway-sdk
├── tsconfig.json
├── src/
│   ├── index.ts              # Main export
│   ├── client.ts             # WAGatewayClient class
│   ├── types.ts              # Type definitions
│   ├── errors.ts             # Custom error classes
│   ├── utils.ts              # Helper functions
│   └── __tests__/
│       └── client.test.ts
├── dist/                     # Build output (JS + .d.ts)
├── README.md                 # Dokumentasi
└── LICENSE
```

#### 1.2 `package.json` SDK

```json
{
  "name": "@masedo/wa-gateway-sdk",
  "version": "1.0.0",
  "description": "SDK for WhatsApp API Gateway - send messages & media via WhatsApp Web",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"  // optional, untuk React hooks
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

#### 1.3 API SDK (`client.ts`)

```typescript
import axios, { AxiosInstance } from 'axios';

export interface WAGatewayConfig {
  baseURL: string;        // e.g., 'https://backend-wa-api.masedo.my.id/api'
  apiKey: string;         // API key vendor
  timeout?: number;       // default 30000ms
}

export interface SessionData {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready';
  phoneNumber?: string;
  createdAt: string;
}

export interface QRCodeData {
  sessionId: string;
  qrCode: string;         // base64 atau data URL
  expiresAt?: string;
}

export interface SendMediaOptions {
  sessionId: string;
  to: string;             // nomor WA, format: 628xxx
  mediaUrl?: string;      // URL publik ke file
  mediaBase64?: string;   // base64 content
  mediaType: 'image' | 'document' | 'audio' | 'video';
  caption?: string;
  filename?: string;
}

export interface SendTextOptions {
  sessionId: string;
  to: string;
  message: string;
}

export class WAGatewayClient {
  private client: AxiosInstance;

  constructor(config: WAGatewayConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  // === Session Management ===
  async createSession(name: string): Promise<SessionData> { ... }
  async getSessions(): Promise<SessionData[]> { ... }
  async getSession(sessionId: string): Promise<SessionData> { ... }
  async deleteSession(sessionId: string): Promise<void> { ... }
  async getSessionStatus(sessionId: string): Promise<{ status: string; phoneNumber?: string }> { ... }

  // === QR Code ===
  async getQRCode(sessionId: string): Promise<QRCodeData> { ... }

  // === Messaging ===
  async sendText(options: SendTextOptions): Promise<{ messageId: string; status: string }> { ... }
  async sendMedia(options: SendMediaOptions): Promise<{ messageId: string; status: string }> { ... }

  // === Health ===
  async healthCheck(): Promise<{ status: string; timestamp: string }> { ... }
}
```

#### 1.4 React Hooks (Optional, untuk project React)

```typescript
// src/hooks/useWAGateway.ts
export function useWAGateway(config: WAGatewayConfig) {
  const clientRef = useRef<WAGatewayClient>();
  if (!clientRef.current) {
    clientRef.current = new WAGatewayClient(config);
  }
  return clientRef.current;
}

export function useWASession(client: WAGatewayClient, sessionId: string | null) {
  const [status, setStatus] = useState<string>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Polling status & QR code
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      const data = await client.getSessionStatus(sessionId);
      setStatus(data.status);
      if (data.status === 'qr_ready') {
        const qr = await client.getQRCode(sessionId);
        setQrCode(qr.qrCode);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [client, sessionId]);

  return { status, qrCode, loading };
}
```

---

### Phase 2: Modifikasi Backend API Gateway

#### 2.1 Multi-Tenant Session Management

Saat ini, session terikat ke `userId` (user WA Gateway). Untuk integrasi photobooth, kita perlu:

**Opsi 1: Vendor photobooth register di WA Gateway (auto-provisioning)**
- Saat vendor pertama kali menggunakan fitur WA di photobooth, SDK auto-register ke WA Gateway
- Vendor mendapat API key otomatis
- API key disimpan di DB photobooth, dikaitkan dengan vendor user

**Opsi 2: API Key per Vendor (tanpa register terpisah)**
- Admin WA Gateway membuat API key untuk setiap vendor
- API key dikaitkan dengan `vendor_id` di photobooth
- Tidak perlu login terpisah

**REKOMENDASI: Opsi 1 (Auto-provisioning)** — paling seamless untuk vendor.

#### 2.2 Endpoint Baru / Modifikasi

```
POST /api/integration/register     # Auto-provision vendor → dapat API key
GET  /api/sessions                  # List sessions (by API key owner)
POST /api/sessions                  # Create session
GET  /api/sessions/:id/qr          # Get QR code
GET  /api/sessions/:id/status      # Get session status (polling)
DELETE /api/sessions/:id           # Disconnect & delete session
POST /api/messages/send-text       # Send text message
POST /api/messages/send-media      # Send media (image/document)
GET  /api/health                   # Health check
```

#### 2.3 Modifikasi Database Schema

```sql
-- Tambah kolom untuk integrasi photobooth
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS vendor_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_source TEXT DEFAULT 'direct';
-- 'direct' = WA Gateway dashboard, 'photobooth' = dari project photobooth

-- Tabel untuk mapping vendor photobooth ↔ WA Gateway user
CREATE TABLE IF NOT EXISTS vendor_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL,           -- ID vendor di project photobooth
  vendor_source TEXT NOT NULL,       -- 'photobooth', dll
  wa_user_id UUID REFERENCES users(id),
  api_key_id UUID REFERENCES api_keys(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, vendor_source)
);
```

#### 2.4 Auto-Provisioning Endpoint

```typescript
// POST /api/integration/register
// Body: { vendorId: string, vendorName: string, source: 'photobooth' }
// Response: { apiKey: string, userId: string }
//
// Logic:
// 1. Cek apakah vendor sudah terdaftar (vendor_integrations)
// 2. Jika belum: auto-create user + API key
// 3. Jika sudah: return existing API key
// 4. Simpan mapping vendor_integrations
```

#### 2.5 QR Code Endpoint Enhancement

Saat ini `GET /api/sessions/:id/qr` mengembalikan QR code. Pastikan:
- QR code dikembalikan sebagai **base64 data URL** (untuk langsung ditampilkan di `<img>`)
- Ada **polling endpoint** untuk cek status (`GET /api/sessions/:id/status`)
- QR code **auto-refresh** jika expired
- **SSE/WebSocket** (opsional) untuk real-time update status koneksi

---

### Phase 3: Integrasi di Project Photobooth

#### 3.1 Instalasi SDK

```bash
npm install @masedo/wa-gateway-sdk
# atau
npm install git+https://github.com/edopandoyo/whatsapp-api-gateway.git#packages/wa-gateway-sdk
```

#### 3.2 Setup di Photobooth Backend

```typescript
// photobooth/src/services/whatsapp.ts
import { WAGatewayClient } from '@masedo/wa-gateway-sdk';

const waClient = new WAGatewayClient({
  baseURL: process.env.WA_GATEWAY_URL!,  // https://backend-wa-api.masedo.my.id/api
  apiKey: process.env.WA_GATEWAY_MASTER_KEY!,  // master key untuk auto-provisioning
});

// Auto-provision vendor saat pertama kali setup WA
export async function provisionVendorWA(vendorId: string, vendorName: string) {
  const { apiKey } = await waClient.post('/integration/register', {
    vendorId,
    vendorName,
    source: 'photobooth',
  });

  // Simpan apiKey ke DB photobooth (tabel vendor_settings)
  await db.vendorSettings.upsert({
    where: { vendorId },
    create: { vendorId, waApiKey: apiKey },
    update: { waApiKey: apiKey },
  });

  return apiKey;
}

// Buat client per-vendor dengan API key vendor tersebut
export function getVendorWAClient(vendorApiKey: string) {
  return new WAGatewayClient({
    baseURL: process.env.WA_GATEWAY_URL!,
    apiKey: vendorApiKey,
  });
}
```

#### 3.3 API Endpoints di Photobooth (untuk dashboard vendor)

```typescript
// photobooth/src/routes/whatsapp.routes.ts

// GET /api/vendor/whatsapp/status
// → cek apakah vendor sudah punya sesi WA terhubung

// POST /api/vendor/whatsapp/session
// → buat sesi WA baru untuk vendor

// GET /api/vendor/whatsapp/qr
// → get QR code untuk sesi vendor

// GET /api/vendor/whatsapp/status/:sessionId
// → polling status koneksi

// DELETE /api/vendor/whatsapp/session/:sessionId
// → disconnect sesi WA

// POST /api/vendor/whatsapp/send
// → kirim foto hasil photobooth
//   Body: { sessionId, to, photoUrl, caption }
```

#### 3.4 UI di Dashboard Photobooth

```
┌─────────────────────────────────────────────────┐
│  Dashboard Vendor Photobooth                     │
│                                                   │
│  ┌─────────────┐    ┌─────────────────────────┐ │
│  │  QR Code    │    │  Status: Connected      │ │
│  │  ┌───────┐  │    │  Nomor: 628xxx          │ │
│  │  │ ████  │  │    │                         │ │
│  │  │ ████  │  │    │  [Disconnect]           │ │
│  │  └───────┘  │    └─────────────────────────┘ │
│  └─────────────┘                                 │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Kirim Hasil Photobooth                     │ │
│  │  Nomor Tujuan: [628xxxxxxxxxx]              │ │
│  │  Pilih Sesi: [dropdown sesi photobooth]     │ │
│  │  Caption: [textarea]                        │ │
│  │  [Kirim Foto]                               │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 3.5 Flow Otomatis (Setelah Sesi Photobooth Selesai)

```typescript
// Saat sesi photobooth selesai, otomatis kirim hasil ke WA customer
async function onPhotoboothSessionComplete(sessionId: string, customerPhone: string) {
  const vendor = await getCurrentVendor();
  const vendorWaApiKey = await getVendorWAApiKey(vendor.id);
  const waClient = getVendorWAClient(vendorWaApiKey);

  // Cek apakah vendor punya sesi WA yang connected
  const sessions = await waClient.getSessions();
  const activeSession = sessions.find(s => s.status === 'connected');

  if (!activeSession) {
    throw new Error('WhatsApp belum terhubung. Silakan scan QR code di dashboard.');
  }

  // Kirim foto hasil photobooth
  const photoUrl = await getPhotoboothResultUrl(sessionId);
  await waClient.sendMedia({
    sessionId: activeSession.id,
    to: customerPhone,
    mediaUrl: photoUrl,
    mediaType: 'image',
    caption: `Hasil sesi photobooth Anda!\nSesi: ${sessionId}\nTerima kasih 📸`,
  });
}
```

---

### Phase 4: Publishing & Distribution

#### 4.1 Build & Publish ke npm (private/public)

```bash
cd packages/wa-gateway-sdk
npm run build
npm publish --access public
# atau untuk private registry:
npm publish --registry https://npm.masedo.my.id
```

#### 4.2 Alternatif: GitHub Package Registry

```json
// package.json
{
  "name": "@masedo/wa-gateway-sdk",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

#### 4.3 Alternatif: Git Submodule / Direct Install

```bash
# Install langsung dari GitHub
npm install github:edopandoyo/whatsapp-api-gateway#packages/wa-gateway-sdk
```

---

## 📊 Roadmap Implementasi

### Sprint 1 (Minggu 1): SDK Core
- [ ] Buat struktur `packages/wa-gateway-sdk/`
- [ ] Implementasi `WAGatewayClient` class
- [ ] Type definitions lengkap
- [ ] Error handling
- [ ] Unit tests
- [ ] Build & publish ke npm/GitHub Packages

### Sprint 2 (Minggu 1-2): Backend Enhancement
- [ ] Endpoint `/api/integration/register` (auto-provisioning)
- [ ] Modifikasi schema DB (tabel `vendor_integrations`)
- [ ] Enhancement QR code endpoint (base64 data URL)
- [ ] Polling status endpoint
- [ ] Session isolation per API key
- [ ] Test multi-tenant

### Sprint 3 (Minggu 2): Photobooth Integration
- [ ] Install SDK di project photobooth
- [ ] Backend: `provisionVendorWA()`, `getVendorWAClient()`
- [ ] API endpoints photobooth (`/api/vendor/whatsapp/*`)
- [ ] DB: tabel `vendor_settings` (simpan `waApiKey`)
- [ ] Test auto-provisioning flow

### Sprint 4 (Minggu 2-3): UI Dashboard Photobooth
- [ ] Komponen QR Code scanner di dashboard vendor
- [ ] Status koneksi WhatsApp (real-time polling)
- [ ] UI kirim hasil photobooth
- [ ] Auto-send setelah sesi photobooth selesai
- [ ] Error handling & user feedback

### Sprint 5 (Minggu 3): Testing & Polish
- [ ] End-to-end testing (photobooth → WA Gateway → WhatsApp)
- [ ] Error scenarios (WA disconnected, QR expired, dll)
- [ ] Dokumentasi SDK (README + contoh kode)
- [ ] Dokumentasi integrasi photobooth
- [ ] Deploy & monitoring

---

## 🔒 Keamanan

1. **API Key per vendor** — setiap vendor punya API key sendiri, tidak bisa akses sesi vendor lain
2. **Master Key** — hanya untuk auto-provisioning, disimpan di env var photobooth (tidak expose ke frontend)
3. **Session isolation** — backend WA Gateway memastikan API key hanya bisa akses session miliknya
4. **HTTPS** — semua komunikasi via HTTPS
5. **Rate limiting** — batasi request per API key
6. **QR code expiry** — QR code expired setelah ~60 detik, auto-refresh

---

## 📁 File yang Perlu Dibuat/Dimodifikasi

### Baru (SDK):
- `packages/wa-gateway-sdk/package.json`
- `packages/wa-gateway-sdk/tsconfig.json`
- `packages/wa-gateway-sdk/src/index.ts`
- `packages/wa-gateway-sdk/src/client.ts`
- `packages/wa-gateway-sdk/src/types.ts`
- `packages/wa-gateway-sdk/src/errors.ts`
- `packages/wa-gateway-sdk/src/hooks/useWAGateway.ts` (React hooks, optional)
- `packages/wa-gateway-sdk/README.md`

### Modifikasi Backend:
- `backend/src/routes/integration.routes.ts` (BARU - auto-provisioning)
- `backend/src/routes/session.routes.ts` (enhance QR endpoint)
- `backend/src/routes/message.routes.ts` (ensure media sending works via API key)
- `backend/src/services/session.service.ts` (multi-tenant isolation)
- `backend/src/middleware/apiKeyAuth.ts` (ensure session ownership check)
- `backend/src/app.ts` (register integration routes)
- `schema_v3.sql` (BARU - tambah tabel vendor_integrations)

### Modifikasi Photobooth (di project photobooth):
- `photobooth/src/services/whatsapp.ts` (BARU)
- `photobooth/src/routes/whatsapp.routes.ts` (BARU)
- `photobooth/src/pages/dashboard/WhatsAppSettings.tsx` (BARU)
- `photobooth/prisma/schema.prisma` atau DB schema (tambah `waApiKey` di vendor_settings)

---

## 🧪 Testing Strategy

1. **Unit Test SDK** — mock HTTP, test setiap method
2. **Integration Test** — SDK ↔ WA Gateway (test mode)
3. **E2E Test** — Photobooth → WA Gateway → WhatsApp (real device)
4. **Multi-tenant Test** — pastikan vendor A tidak bisa akses session vendor B
5. **Error Scenario** — WA disconnected, QR expired, API key invalid, rate limit

---

## 💡 Alternatif Sederhana (Quick Win)

Jika ingin implementasi cepat tanpa publish npm package:

1. **Copy `api.ts` dari frontend** ke project photobooth sebagai service
2. **Adapt** endpoint sesuai kebutuhan photobooth
3. **Tambah auto-provisioning** endpoint di backend
4. **Integrasikan** langsung tanpa npm package

```typescript
// photobooth/src/services/wa-gateway.ts (copy & adapt dari frontend/src/services/api.ts)
const WA_API_URL = process.env.WA_GATEWAY_URL;
const WA_API_KEY = getVendorWAApiKey(vendorId);

export async function createWASession(name: string) {
  const res = await fetch(`${WA_API_URL}/sessions`, {
    method: 'POST',
    headers: { 'x-api-key': WA_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
// ... dst
```

**Trade-off:** Lebih cepat implementasi, tapi tidak reusable dan tidak ada type safety sebaik SDK.

---

## 🎯 Kesimpulan

**Rekomendasi: Implementasi OPSI A (SDK Client + API Gateway Terpusat)** dengan roadmap 3 minggu:

1. **Minggu 1**: Buat SDK package + backend enhancement (auto-provisioning, multi-tenant)
2. **Minggu 2**: Integrasikan SDK ke project photobooth + buat API endpoints
3. **Minggu 3**: UI dashboard photobooth + testing + deploy

**Hasil akhir:**
- ✅ Vendor photobooth dapat scan QR code WhatsApp di dashboard mereka
- ✅ Setelah terhubung, vendor dapat kirim hasil photobooth via WhatsApp
- ✅ SDK reusable untuk project lain di masa depan
- ✅ WhatsApp session persist di server terpusat (tidak hilang saat photobooth restart)
- ✅ Backward compatible dengan WA Gateway existing