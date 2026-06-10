import { useState } from 'react';
import {
    BookOpen, Terminal, Key, Send, Image,
    Layers, Zap, ChevronRight, Copy, Check,
    Wifi, AlertCircle, Code2, Globe,
} from 'lucide-react';
import styles from './DocsPage.module.css';

// ─────────────────────────────────────────────
// Config — baca dari environment variable
// ─────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://backend-wa-api.masedo.my.id';
const API_HOST = API_BASE.replace(/^https?:\/\//, '');

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Section =
    | 'overview'
    | 'auth'
    | 'send-text'
    | 'send-media'
    | 'send-bulk'
    | 'sessions'
    | 'webhooks'
    | 'errors';

interface NavItem {
    id: Section;
    label: string;
    icon: React.ElementType;
    group: string;
}

// ─────────────────────────────────────────────
// Code Block
// ─────────────────────────────────────────────
function CodeBlock({ code, lang = 'json' }: { code: string; lang?: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.codeBlock}>
            <div className={styles.codeHeader}>
                <span className={styles.codeLang}>{lang}</span>
                <button className={styles.copyBtn} onClick={copy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Disalin' : 'Salin'}
                </button>
            </div>
            <pre className={styles.codePre}><code>{code}</code></pre>
        </div>
    );
}

// ─────────────────────────────────────────────
// Badge helpers
// ─────────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
    return (
        <span className={styles.methodBadge} data-method={method.toLowerCase()}>
            {method}
        </span>
    );
}

function ParamRow({
    name, type, required, desc,
}: {
    name: string; type: string; required?: boolean; desc: string;
}) {
    return (
        <tr>
            <td><code className={styles.paramName}>{name}</code></td>
            <td><code className={styles.paramType}>{type}</code></td>
            <td>
                {required
                    ? <span className={styles.required}>wajib</span>
                    : <span className={styles.optional}>opsional</span>}
            </td>
            <td className={styles.paramDesc}>{desc}</td>
        </tr>
    );
}

// ─────────────────────────────────────────────
// Section content components
// ─────────────────────────────────────────────
function SectionOverview() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Gambaran Umum</h1>
            <p className={styles.sectionLead}>
                WebWA Gateway menyediakan REST API untuk mengirim dan menerima pesan WhatsApp
                secara terprogram. Semua endpoint menggunakan format JSON.
            </p>

            <div className={styles.infoGrid}>
                <div className={styles.infoCard}>
                    <Globe size={18} />
                    <div>
                        <p className={styles.infoLabel}>Base URL</p>
                        <code className={styles.infoValue}>{API_BASE}</code>
                    </div>
                </div>
                <div className={styles.infoCard}>
                    <Code2 size={18} />
                    <div>
                        <p className={styles.infoLabel}>Format</p>
                        <code className={styles.infoValue}>application/json</code>
                    </div>
                </div>
                <div className={styles.infoCard}>
                    <Wifi size={18} />
                    <div>
                        <p className={styles.infoLabel}>Real-time</p>
                        <code className={styles.infoValue}>Socket.io v4</code>
                    </div>
                </div>
                <div className={styles.infoCard}>
                    <Key size={18} />
                    <div>
                        <p className={styles.infoLabel}>Autentikasi</p>
                        <code className={styles.infoValue}>x-api-key header</code>
                    </div>
                </div>
            </div>

            <h2 className={styles.h2}>Alur Integrasi</h2>
            <div className={styles.stepList}>
                {[
                    { n: '1', t: 'Buat Sesi', d: 'Login ke dashboard, hubungkan nomor WhatsApp via QR Code.' },
                    { n: '2', t: 'Generate API Key', d: 'Buat API Key di halaman Pengaturan. Simpan key dengan aman.' },
                    { n: '3', t: 'Kirim Pesan', d: 'Gunakan API Key di header x-api-key untuk memanggil endpoint.' },
                    { n: '4', t: 'Terima Pesan', d: 'Konfigurasi Webhook URL untuk menerima event pesan masuk.' },
                ].map(s => (
                    <div key={s.n} className={styles.step}>
                        <span className={styles.stepNum}>{s.n}</span>
                        <div>
                            <p className={styles.stepTitle}>{s.t}</p>
                            <p className={styles.stepDesc}>{s.d}</p>
                        </div>
                    </div>
                ))}
            </div>

            <h2 className={styles.h2}>Struktur Response</h2>
            <p className={styles.p}>Semua response mengikuti format berikut:</p>
            <CodeBlock lang="json" code={`// Sukses
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": "Pesan error yang menjelaskan masalah."
}`} />
        </div>
    );
}

function SectionAuth() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Autentikasi</h1>
            <p className={styles.sectionLead}>
                API eksternal menggunakan API Key yang dikirim via header <code>x-api-key</code>.
            </p>

            <div className={styles.tipBox}>
                <Key size={15} />
                <div>
                    <p className={styles.tipTitle}>Cara mendapatkan API Key</p>
                    <p className={styles.tipDesc}>
                        Buka <strong>Dashboard → Pengaturan → API Keys</strong>, klik <em>"Buat API Key"</em>,
                        beri label, lalu salin key yang muncul. Key hanya ditampilkan <strong>sekali</strong> — simpan segera.
                    </p>
                </div>
            </div>

            <div className={styles.alertBox} data-type="warning">
                <AlertCircle size={16} />
                <p>Jangan pernah menyimpan API Key di kode frontend atau repository publik.</p>
            </div>

            <h2 className={styles.h2}>Header Autentikasi</h2>
            <CodeBlock lang="http" code={`POST /api/v1/messages/text HTTP/1.1
Host: ${API_HOST}
x-api-key: wa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`} />

            <h2 className={styles.h2}>Contoh dengan cURL</h2>
            <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/api/v1/messages/text \\
  -H "x-api-key: wa_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"session_id": "YOUR_SESSION_ID", "to": "6281234567890", "text": "Halo!"}'`} />

            <h2 className={styles.h2}>Contoh dengan JavaScript</h2>
            <CodeBlock lang="javascript" code={`const response = await fetch('${API_BASE}/api/v1/messages/text', {
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
console.log(result);`} />

            <h2 className={styles.h2}>Error Autentikasi</h2>
            <CodeBlock lang="json" code={`// 401 — API Key tidak disertakan
{ "success": false, "error": "API Key tidak ditemukan." }

// 403 — API Key tidak valid atau nonaktif
{ "success": false, "error": "API Key tidak valid." }`} />
        </div>
    );
}

function SectionSendText() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Kirim Pesan Teks</h1>
            <p className={styles.sectionLead}>
                Mengirim pesan teks ke satu nomor WhatsApp. <code>sessionId</code> wajib disertakan di URL.
            </p>

            <div className={styles.endpointBar}>
                <MethodBadge method="POST" />
                <code>/api/v1/messages/text</code>
            </div>

            <h2 className={styles.h2}>Request Body</h2>
            <table className={styles.table}>
                <thead>
                    <tr><th>Parameter</th><th>Tipe</th><th>Status</th><th>Deskripsi</th></tr>
                </thead>
                <tbody>
                    <ParamRow name="session_id" type="string (uuid)" required desc="UUID sesi WhatsApp. Dapatkan dari dashboard → Sesi." />
                    <ParamRow name="to" type="string" required desc="Nomor tujuan format internasional (628xxx atau 08xxx)" />
                    <ParamRow name="text" type="string" required desc="Isi pesan teks yang akan dikirim" />
                </tbody>
            </table>

            <h2 className={styles.h2}>Contoh Request</h2>
            <CodeBlock lang="http" code={`POST /api/v1/messages/text
x-api-key: wa_YOUR_API_KEY
Content-Type: application/json

{
  "session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68",
  "to": "6281234567890",
  "text": "Halo! Pesanan Anda #12345 telah dikonfirmasi."
}`} />

            <h2 className={styles.h2}>Contoh Response</h2>
            <CodeBlock lang="json" code={`{
  "success": true,
  "data": {
    "id": "3EB0XXXXXXXXXXXXXX",
    "to": "6281234567890@c.us",
    "type": "text"
  }
}`} />

            <h2 className={styles.h2}>Contoh dengan cURL</h2>
            <CodeBlock lang="bash" code={`curl -X POST \\
  ${API_BASE}/api/v1/messages/text \\
  -H "x-api-key: wa_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"session_id": "f6e624fb-24eb-4f3e-a15f-d22280b3bf68", "to": "6281234567890", "text": "Halo dari sistem saya!"}'`} />

            <h2 className={styles.h2}>Contoh dengan JavaScript</h2>
            <CodeBlock lang="javascript" code={`const res = await fetch('${API_BASE}/api/v1/messages/text', {
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
const { success, data } = await res.json();`} />
        </div>
    );
}

function SectionSendMedia() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Kirim Media</h1>
            <p className={styles.sectionLead}>
                Mengirim gambar, dokumen, atau file lain. Mendukung pengiriman via URL atau base64.
            </p>

            <div className={styles.endpointBar}>
                <MethodBadge method="POST" />
                <code>/api/v1/sessions/:sessionId/messages/media</code>
            </div>

            <h2 className={styles.h2}>Request Body</h2>
            <table className={styles.table}>
                <thead>
                    <tr><th>Parameter</th><th>Tipe</th><th>Status</th><th>Deskripsi</th></tr>
                </thead>
                <tbody>
                    <ParamRow name="to" type="string" required desc="Nomor tujuan format internasional" />
                    <ParamRow name="mediaUrl" type="string" desc="URL publik file media (gunakan ini atau base64)" />
                    <ParamRow name="base64" type="string" desc="String base64 dari file (gunakan ini atau mediaUrl)" />
                    <ParamRow name="mimetype" type="string" required desc="MIME type file, mis: image/jpeg, application/pdf" />
                    <ParamRow name="filename" type="string" desc="Nama file yang ditampilkan ke penerima" />
                    <ParamRow name="caption" type="string" desc="Keterangan di bawah media (opsional)" />
                </tbody>
            </table>

            <h2 className={styles.h2}>Kirim via URL</h2>
            <CodeBlock lang="json" code={`{
  "to": "6281234567890",
  "mediaUrl": "https://example.com/invoice.pdf",
  "mimetype": "application/pdf",
  "filename": "Invoice-12345.pdf",
  "caption": "Berikut invoice Anda."
}`} />

            <h2 className={styles.h2}>Kirim via Base64</h2>
            <CodeBlock lang="json" code={`{
  "to": "6281234567890",
  "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "mimetype": "image/jpeg",
  "filename": "foto.jpg",
  "caption": "Foto produk terbaru!"
}`} />

            <h2 className={styles.h2}>Response</h2>
            <CodeBlock lang="json" code={`{
  "success": true,
  "data": {
    "id": "3EB0XXXXXXXXXXXXXX",
    "to": "6281234567890@c.us",
    "type": "media"
  }
}`} />
        </div>
    );
}

function SectionSendBulk() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Kirim Bulk</h1>
            <p className={styles.sectionLead}>
                Mengirim pesan ke banyak nomor sekaligus. Maksimum 100 nomor per request.
                Delay 1.2 detik antar pesan untuk menghindari deteksi spam.
            </p>

            <div className={styles.endpointBar}>
                <MethodBadge method="POST" />
                <code>/api/v1/sessions/:sessionId/messages/bulk</code>
            </div>

            <div className={styles.alertBox} data-type="warning">
                <AlertCircle size={16} />
                <p>Pengiriman bulk memerlukan waktu. Untuk 100 pesan, estimasi waktu ~2 menit. Gunakan timeout yang sesuai.</p>
            </div>

            <h2 className={styles.h2}>Request Body</h2>
            <table className={styles.table}>
                <thead>
                    <tr><th>Parameter</th><th>Tipe</th><th>Status</th><th>Deskripsi</th></tr>
                </thead>
                <tbody>
                    <ParamRow name="messages" type="array" required desc="Array objek pesan, maks 100 item" />
                    <ParamRow name="messages[].to" type="string" required desc="Nomor tujuan" />
                    <ParamRow name="messages[].text" type="string" required desc="Isi pesan teks" />
                </tbody>
            </table>

            <h2 className={styles.h2}>Contoh Request</h2>
            <CodeBlock lang="json" code={`{
  "messages": [
    { "to": "6281234567890", "text": "Halo Budi, promo hari ini 20% off!" },
    { "to": "6289876543210", "text": "Halo Ani, promo hari ini 20% off!" },
    { "to": "6281111222333", "text": "Halo Sari, promo hari ini 20% off!" }
  ]
}`} />

            <h2 className={styles.h2}>Contoh Response</h2>
            <CodeBlock lang="json" code={`{
  "success": true,
  "data": {
    "total": 3,
    "results": [
      { "to": "6281234567890@c.us", "status": "sent",    "id": "3EB0XX..." },
      { "to": "6289876543210@c.us", "status": "sent",    "id": "3EB0XY..." },
      { "to": "6281111222333@c.us", "status": "failed",  "error": "Nomor tidak terdaftar di WhatsApp" }
    ]
  }
}`} />
        </div>
    );
}

function SectionSessions() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Manajemen Sesi</h1>
            <p className={styles.sectionLead}>
                Endpoint internal untuk mengelola sesi WhatsApp. Memerlukan autentikasi JWT (Bearer Token).
            </p>

            {[
                {
                    method: 'GET', path: '/api/internal/sessions',
                    desc: 'Ambil daftar semua sesi milik akun.',
                    response: `{
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
}`,
                },
                {
                    method: 'POST', path: '/api/internal/sessions',
                    desc: 'Buat sesi baru. QR Code akan dikirim via Socket.io.',
                    request: `{ "name": "Nomor CS 2", "webhook_url": "https://myapp.com/webhook" }`,
                    response: `{ "success": true, "data": { "id": "...", "status": "pending" } }`,
                },
                {
                    method: 'DELETE', path: '/api/internal/sessions/:id',
                    desc: 'Logout dan hapus sesi beserta datanya.',
                    response: `{ "success": true, "message": "Sesi berhasil dihapus." }`,
                },
                {
                    method: 'POST', path: '/api/internal/sessions/:id/reconnect',
                    desc: 'Re-inisialisasi sesi yang terputus.',
                    response: `{ "success": true, "message": "Proses reconnect dimulai." }`,
                },
            ].map((ep, i) => (
                <div key={i} className={styles.endpointBlock}>
                    <div className={styles.endpointBar}>
                        <MethodBadge method={ep.method} />
                        <code>{ep.path}</code>
                    </div>
                    <p className={styles.endpointDesc}>{ep.desc}</p>
                    {ep.request && <><p className={styles.miniLabel}>Request</p><CodeBlock lang="json" code={ep.request} /></>}
                    <p className={styles.miniLabel}>Response</p>
                    <CodeBlock lang="json" code={ep.response} />
                </div>
            ))}
        </div>
    );
}

function SectionWebhooks() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Webhooks</h1>
            <p className={styles.sectionLead}>
                Server akan mengirim HTTP POST ke URL webhook Anda setiap ada event baru.
                Sistem akan retry 3x dengan backoff eksponensial jika endpoint gagal.
            </p>

            <h2 className={styles.h2}>Konfigurasi Webhook</h2>
            <p className={styles.p}>Atur Webhook URL di halaman <strong>Pengaturan → Webhook URLs</strong>, atau via API:</p>
            <CodeBlock lang="http" code={`PATCH /api/internal/sessions/:id
Authorization: Bearer YOUR_JWT_TOKEN

{ "webhook_url": "https://your-app.com/webhook/whatsapp" }`} />

            <h2 className={styles.h2}>Event: Pesan Masuk</h2>
            <CodeBlock lang="json" code={`{
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
}`} />

            <h2 className={styles.h2}>Retry Logic</h2>
            <div className={styles.retryTable}>
                {[
                    { attempt: 'Attempt 1', delay: 'Langsung' },
                    { attempt: 'Attempt 2', delay: 'Setelah 1 detik' },
                    { attempt: 'Attempt 3', delay: 'Setelah 5 detik' },
                    { attempt: 'Attempt 4', delay: 'Setelah 15 detik' },
                ].map(r => (
                    <div key={r.attempt} className={styles.retryRow}>
                        <span className={styles.retryAttempt}>{r.attempt}</span>
                        <span className={styles.retryDelay}>{r.delay}</span>
                    </div>
                ))}
            </div>

            <h2 className={styles.h2}>Validasi Webhook</h2>
            <p className={styles.p}>Pastikan endpoint Anda mengembalikan HTTP 2xx dalam 10 detik. Contoh handler Express:</p>
            <CodeBlock lang="javascript" code={`app.post('/webhook/whatsapp', (req, res) => {
  const { event, session_id, data } = req.body;

  if (event === 'message.received') {
    console.log(\`Pesan dari \${data.from}: \${data.body}\`);
    // proses pesan di sini...
  }

  res.status(200).json({ received: true }); // wajib 2xx
});`} />
        </div>
    );
}

function SectionErrors() {
    return (
        <div className={styles.sectionContent}>
            <h1 className={styles.sectionTitle}>Kode Error</h1>
            <p className={styles.sectionLead}>
                Semua error dikembalikan dalam format JSON dengan field <code>success: false</code> dan <code>error</code>.
            </p>

            <table className={styles.table}>
                <thead>
                    <tr><th>HTTP Status</th><th>Kode</th><th>Penyebab</th></tr>
                </thead>
                <tbody>
                    {[
                        ['400', 'Bad Request', 'Field wajib tidak ada atau format tidak valid'],
                        ['401', 'Unauthorized', 'API Key tidak disertakan di header'],
                        ['403', 'Forbidden', 'API Key tidak valid, nonaktif, atau tidak punya akses'],
                        ['404', 'Not Found', 'Sesi tidak ditemukan atau bukan milik Anda'],
                        ['409', 'Conflict', 'Sesi belum terhubung, status bukan connected'],
                        ['429', 'Too Many Requests', 'Rate limit tercapai, coba lagi setelah beberapa saat'],
                        ['500', 'Internal Server Error', 'Kesalahan server, coba lagi atau hubungi support'],
                    ].map(([status, code, cause]) => (
                        <tr key={status}>
                            <td><code className={styles.statusCode} data-status={status[0]}>{status}</code></td>
                            <td><strong>{code}</strong></td>
                            <td className={styles.paramDesc}>{cause}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h2 className={styles.h2}>Contoh Error Response</h2>
            <CodeBlock lang="json" code={`// 409 — Sesi belum terhubung
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
  "error": "Field \\"to\\" dan \\"text\\" wajib diisi."
}`} />

            <h2 className={styles.h2}>Rate Limiting</h2>
            <p className={styles.p}>
                Setiap API Key dibatasi <strong>100 request per menit</strong>. Jika melebihi batas,
                server mengembalikan HTTP 429 dengan header:
            </p>
            <CodeBlock lang="http" code={`HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711000060`} />
        </div>
    );
}

// ─────────────────────────────────────────────
// Nav config
// ─────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
    { id: 'overview', label: 'Gambaran Umum', icon: BookOpen, group: 'Mulai' },
    { id: 'auth', label: 'Autentikasi', icon: Key, group: 'Mulai' },
    { id: 'send-text', label: 'Kirim Teks', icon: Send, group: 'Endpoints' },
    { id: 'send-media', label: 'Kirim Media', icon: Image, group: 'Endpoints' },
    { id: 'send-bulk', label: 'Kirim Bulk', icon: Layers, group: 'Endpoints' },
    { id: 'sessions', label: 'Sesi', icon: Terminal, group: 'Endpoints' },
    { id: 'webhooks', label: 'Webhooks', icon: Zap, group: 'Lanjutan' },
    { id: 'errors', label: 'Kode Error', icon: AlertCircle, group: 'Lanjutan' },
];

const SECTION_MAP: Record<Section, React.ComponentType> = {
    overview: SectionOverview,
    auth: SectionAuth,
    'send-text': SectionSendText,
    'send-media': SectionSendMedia,
    'send-bulk': SectionSendBulk,
    sessions: SectionSessions,
    webhooks: SectionWebhooks,
    errors: SectionErrors,
};

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function DocsPage() {
    const [active, setActive] = useState<Section>('overview');
    const ActiveSection = SECTION_MAP[active];

    const groups = [...new Set(NAV_ITEMS.map(i => i.group))];

    return (
        <div className={styles.page}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarLogo}>
                    <div className={styles.logoIcon}><BookOpen size={16} /></div>
                    <div>
                        <p className={styles.logoTitle}>API Docs</p>
                        <p className={styles.logoVersion}>v1.0.0</p>
                    </div>
                </div>

                <nav className={styles.nav}>
                    {groups.map(group => (
                        <div key={group} className={styles.navGroup}>
                            <p className={styles.navGroupLabel}>{group}</p>
                            {NAV_ITEMS.filter(i => i.group === group).map(item => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        className={styles.navItem}
                                        data-active={active === item.id}
                                        onClick={() => setActive(item.id)}
                                    >
                                        <Icon size={15} />
                                        <span>{item.label}</span>
                                        {active === item.id && <ChevronRight size={13} className={styles.navChevron} />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Content */}
            <main className={styles.main}>
                <ActiveSection />
            </main>
        </div>
    );
}