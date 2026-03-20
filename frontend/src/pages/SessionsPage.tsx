import { useEffect, useState, useCallback } from 'react';
import {
  Plus, QrCode, Trash2, RotateCcw, Copy, Check,
  Loader2, Smartphone, Globe, Bot, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';
import type { Session } from '../types';
import StatusBadge from '../components/StatusBadge';
import QrModal from '../components/QrModal';
import SessionDetailDrawer from '../components/SessionDetailDrawer';
import toast from 'react-hot-toast';
import styles from './SessionsPage.module.css';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Drawer state ──────────────────────────
  const [detailSession, setDetailSession] = useState<Session | null>(null);

  // Dialog state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHook, setNewHook] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    api.get<{ data: Session[] }>('/api/internal/sessions')
      .then(r => setSessions(r.data.data))
      .catch(() => toast.error('Gagal memuat sesi'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const createSession = async () => {
    if (!newName.trim()) { toast.error('Nama sesi wajib diisi'); return; }
    try {
      setSavingNew(true);
      const { data } = await api.post<{ data: Session }>('/api/internal/sessions', {
        name: newName.trim(),
        webhookUrl: newHook.trim() || null,
      });
      setSessions(prev => [data.data, ...prev]);
      toast.success('Sesi berhasil dibuat!');
      setShowAdd(false); setNewName(''); setNewHook('');
      setQrSession(data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Gagal membuat sesi');
    } finally {
      setSavingNew(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Hapus sesi ini?')) return;
    try {
      await api.delete(`/api/internal/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (detailSession?.id === id) setDetailSession(null);
      toast.success('Sesi dihapus');
    } catch {
      toast.error('Gagal menghapus sesi');
    }
  };

  const reconnect = async (id: string) => {
    try {
      await api.post(`/api/internal/sessions/${id}/reconnect`);
      toast.success('Menghubungkan ulang…');
      fetchSessions();
    } catch {
      toast.error('Gagal menghubungkan ulang');
    }
  };

  const copySessionId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('Session ID disalin');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Sesi WhatsApp</h1>
          <p className={styles.sub}>Kelola koneksi WhatsApp Anda</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={15} />
          Tambah Sesi
        </button>
      </div>

      {/* Add Session Panel */}
      {showAdd && (
        <div className={styles.addPanel}>
          <h3>Sesi Baru</h3>
          <div className={styles.addForm}>
            <div className={styles.field}>
              <label>Nama Sesi *</label>
              <input
                autoFocus placeholder="misal: Marketing, CS Bot"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createSession()}
              />
            </div>
            <div className={styles.field}>
              <label>Webhook URL (opsional)</label>
              <input
                type="url" placeholder="https://..."
                value={newHook} onChange={e => setNewHook(e.target.value)}
              />
            </div>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn}
                onClick={() => { setShowAdd(false); setNewName(''); setNewHook(''); }}>
                Batal
              </button>
              <button className={styles.confirmBtn} onClick={createSession} disabled={savingNew}>
                {savingNew ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {savingNew ? 'Membuat…' : 'Buat & Scan QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={28} className="animate-spin" color="var(--c-brand-500)" />
        </div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty}>
          <Smartphone size={48} color="var(--c-text-3)" />
          <p>Belum ada sesi WhatsApp</p>
          <p style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Klik tombol "Tambah Sesi" untuk memulai</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sessions.map(sess => (
            <div
              key={sess.id}
              className={`${styles.card} ${detailSession?.id === sess.id ? styles.cardActive : ''}`}
            >
              {/* Card Header */}
              <div className={styles.cardTop}>
                <div className={styles.sessionWrap}>
                  <div className={styles.sessionIcon}>
                    <Smartphone size={17} />
                  </div>
                  <div>
                    <p className={styles.sessionName}>{sess.session_name}</p>
                    <p className={styles.sessionId} title={sess.id}>{sess.id.slice(0, 8)}…</p>
                  </div>
                </div>
                <StatusBadge status={sess.status} />
              </div>

              {/* Webhook */}
              {sess.webhook_url && (
                <div className={styles.webhook}>
                  <Globe size={12} />
                  <span title={sess.webhook_url}>{sess.webhook_url}</span>
                </div>
              )}

              {/* Last connected */}
              <p className={styles.lastConn}>
                {sess.last_connected_at
                  ? `Terakhir: ${new Date(sess.last_connected_at).toLocaleString('id-ID')}`
                  : 'Belum pernah terhubung'}
              </p>

              {/* Actions */}
              <div className={styles.actions}>
                <button
                  className={styles.actionBtn}
                  onClick={() => copySessionId(sess.id)}
                  title="Salin Session ID"
                >
                  {copiedId === sess.id
                    ? <Check size={14} color="var(--c-success)" />
                    : <Copy size={14} />
                  }
                  {copiedId === sess.id ? 'Tersalin' : 'Salin ID'}
                </button>
                {sess.status !== 'connected' && (
                  <button
                    className={styles.actionBtn}
                    onClick={() => setQrSession(sess)}
                    title="Scan QR"
                  >
                    <QrCode size={14} />
                    Scan QR
                  </button>
                )}
                {(sess.status === 'disconnected' || sess.status === 'auth_failure') && (
                  <button
                    className={styles.actionBtn}
                    onClick={() => reconnect(sess.id)}
                    title="Hubungkan ulang"
                  >
                    <RotateCcw size={14} />
                    Ulang
                  </button>
                )}

                {/* ── NEW: Detail / AI Config button ── */}
                <button
                  className={`${styles.actionBtn} ${styles.detailBtn}`}
                  onClick={() => setDetailSession(sess)}
                  title="Detail & AI Config"
                >
                  <Bot size={14} />
                  AI Config
                  <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
                </button>

                <button
                  className={`${styles.actionBtn} ${styles.danger}`}
                  onClick={() => deleteSession(sess.id)}
                  title="Hapus sesi"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR Modal */}
      {qrSession && (
        <QrModal
          session={qrSession}
          onClose={() => setQrSession(null)}
          onReady={fetchSessions}
        />
      )}

      {/* ── NEW: Session Detail Drawer ── */}
      {detailSession && (
        <SessionDetailDrawer
          session={detailSession}
          onClose={() => setDetailSession(null)}
        />
      )}
    </div>
  );
}
