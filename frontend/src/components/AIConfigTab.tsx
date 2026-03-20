import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Save, Loader2, RotateCcw, Trash2,
  ChevronDown, ChevronUp, Zap, ZapOff, Clock,
} from 'lucide-react';
import api from '../lib/api';
import type { Session } from '../types';
import toast from 'react-hot-toast';
import styles from './AIConfigTab.module.css';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface AIConfig {
  id?: string;
  is_enabled: boolean;
  context: string;
  ollama_url: string;
  model: string;
  max_tokens: number;
  fallback_message?: string;
}

interface AILog {
  id: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  payload: { text: string };
  created_at: string;
  source: 'ai_reply' | 'api' | 'manual';
}

const DEFAULT_CONFIG: AIConfig = {
  is_enabled: false,
  context: '',
  ollama_url: 'http://localhost:11434',
  model: 'qwen2.5:7b',
  max_tokens: 500,
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function AIConfigTab({ session }: { session: Session }) {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  // AI reply logs
  const [logs, setLogs] = useState<AILog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);

  // ── Fetch config ──────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/internal/sessions/${session.id}/ai-config`);
      setConfig(data.data ?? DEFAULT_CONFIG);
    } catch (err: any) {
      // 404 = belum ada config, pakai default
      if (err?.response?.status !== 404) {
        toast.error('Gagal memuat konfigurasi AI');
      }
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  // ── Fetch AI reply logs ───────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await api.get(`/api/internal/messages`, {
        params: { session_id: session.id, source: 'ai_reply', limit: 20 },
      });
      setLogs(data.data ?? []);
    } catch {
      // non-critical
    } finally {
      setLogsLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    fetchConfig();
    fetchLogs();
  }, [fetchConfig, fetchLogs]);

  // ── Toggle ON/OFF ─────────────────────────
  const handleToggle = async () => {
    setToggling(true);
    const nextState = !config.is_enabled;
    try {
      await api.patch(`/api/internal/sessions/${session.id}/ai-config/toggle`, {
        is_enabled: nextState,
      });
      setConfig(prev => ({ ...prev, is_enabled: nextState }));
      toast.success(nextState ? 'AI Auto Reply diaktifkan' : 'AI Auto Reply dinonaktifkan');
    } catch {
      toast.error('Gagal mengubah status AI');
    } finally {
      setToggling(false);
    }
  };

  // ── Save config ───────────────────────────
  const handleSave = async () => {
    if (!config.ollama_url.trim()) {
      toast.error('Ollama URL wajib diisi');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/internal/sessions/${session.id}/ai-config`, {
        context: config.context,
        ollama_url: config.ollama_url.trim(),
        model: config.model.trim() || 'qwen2.5:7b',
        max_tokens: Number(config.max_tokens) || 500,
        fallback_message: config.fallback_message?.trim() || '',
      });
      toast.success('Konfigurasi AI disimpan');
    } catch {
      toast.error('Gagal menyimpan konfigurasi');
    } finally {
      setSaving(false);
    }
  };

  // ── Clear history ─────────────────────────
  const handleClearHistory = async () => {
    if (!confirm('Hapus semua riwayat percakapan AI sesi ini?')) return;
    setClearingHistory(true);
    try {
      await api.delete(`/api/internal/sessions/${session.id}/ai-history`);
      setLogs([]);
      toast.success('Riwayat AI dihapus');
    } catch {
      toast.error('Gagal menghapus riwayat');
    } finally {
      setClearingHistory(false);
    }
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <Loader2 size={24} className={styles.spin} />
        <span>Memuat konfigurasi AI…</span>
      </div>
    );
  }

  return (
    <div className={styles.root}>

      {/* ── Toggle Card ── */}
      <div className={`${styles.toggleCard} ${config.is_enabled ? styles.active : ''}`}>
        <div className={styles.toggleInfo}>
          <div className={styles.toggleIconWrap}>
            {config.is_enabled
              ? <Zap size={18} className={styles.zapOn} />
              : <ZapOff size={18} className={styles.zapOff} />
            }
          </div>
          <div>
            <p className={styles.toggleTitle}>AI Auto Reply</p>
            <p className={styles.toggleDesc}>
              {config.is_enabled
                ? 'Aktif — Pesan masuk akan dibalas otomatis oleh AI'
                : 'Nonaktif — Pesan masuk tidak dibalas otomatis'}
            </p>
          </div>
        </div>
        <button
          className={`${styles.toggleBtn} ${config.is_enabled ? styles.toggleOn : styles.toggleOff}`}
          onClick={handleToggle}
          disabled={toggling}
          aria-label="Toggle AI Auto Reply"
        >
          {toggling
            ? <Loader2 size={12} className={styles.spin} />
            : <span className={styles.toggleThumb} />
          }
        </button>
      </div>

      {/* ── Config Form ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Bot size={15} />
          <span>Konteks &amp; Informasi Bisnis</span>
        </div>
        <p className={styles.sectionDesc}>
          Berikan informasi tentang bisnis, produk, atau instruksi khusus agar
          AI bisa memberikan jawaban yang relevan.
        </p>

        <textarea
          className={styles.textarea}
          rows={6}
          placeholder={`Contoh:\nKamu adalah CS toko sepatu "Shoes Store".\nProduk: Nike, Adidas, New Balance.\nHarga mulai 200rb–800rb.\nJam operasional: Senin–Sabtu 08.00–21.00 WIB.\nUntuk pertanyaan di luar produk kami, mohon maaf tidak bisa membantu.`}
          value={config.context}
          onChange={e => setConfig(prev => ({ ...prev, context: e.target.value }))}
        />

        {/* Advanced Settings */}
        <button
          className={styles.advToggle}
          onClick={() => setShowAdv(v => !v)}
        >
          {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Pengaturan Lanjutan
        </button>

        {showAdv && (
          <div className={styles.advGrid}>
            <div className={styles.field}>
              <label>Ollama URL</label>
              <input
                type="url"
                value={config.ollama_url}
                onChange={e => setConfig(prev => ({ ...prev, ollama_url: e.target.value }))}
                placeholder="http://localhost:11434"
              />
              <span className={styles.hint}>
                Gunakan <code>http://host.docker.internal:11434</code> jika backend berjalan dalam Docker
              </span>
            </div>
            <div className={styles.field}>
              <label>Model</label>
              <input
                value={config.model}
                onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                placeholder="qwen2.5:7b"
              />
            </div>
            <div className={styles.field}>
              <label>Maks Token Output</label>
              <input
                type="number"
                min={100}
                max={2000}
                value={config.max_tokens}
                onChange={e => setConfig(prev => ({ ...prev, max_tokens: Number(e.target.value) }))}
              />
              <span className={styles.hint}>Semakin kecil = respons lebih singkat &amp; cepat</span>
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label>Pesan Fallback</label>
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder="Pesan yang dikirim jika AI gagal menjawab..."
            value={config.fallback_message ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, fallback_message: e.target.value }))}
          />
          <span className={styles.hint}>
            Dikirim otomatis jika AI tidak bisa merespons (timeout, error, dll)
          </span>
        </div>

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving
            ? <><Loader2 size={14} className={styles.spin} /> Menyimpan…</>
            : <><Save size={14} /> Simpan Konfigurasi</>
          }
        </button>
      </div>



      {/* ── AI Reply Log ── */}
      <div className={styles.section}>
        <div className={styles.logHeader}>
          <div className={styles.sectionHeader}>
            <Clock size={15} />
            <span>Riwayat Balasan AI</span>
          </div>
          <div className={styles.logActions}>
            <button className={styles.iconBtn} onClick={fetchLogs} title="Refresh">
              <RotateCcw size={13} />
            </button>
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              onClick={handleClearHistory}
              disabled={clearingHistory}
              title="Hapus semua history"
            >
              {clearingHistory
                ? <Loader2 size={13} className={styles.spin} />
                : <Trash2 size={13} />
              }
            </button>
          </div>
        </div>

        {logsLoading ? (
          <div className={styles.logsLoading}>
            <Loader2 size={18} className={styles.spin} />
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.logsEmpty}>
            <Bot size={32} />
            <p>Belum ada riwayat balasan AI</p>
            <span>Aktifkan AI Auto Reply dan tunggu pesan masuk</span>
          </div>
        ) : (
          <div className={styles.logList}>
            {logs.map(log => (
              <div
                key={log.id}
                className={`${styles.logItem} ${log.direction === 'inbound' ? styles.inbound : styles.outbound}`}
              >
                <div className={styles.logMeta}>
                  <span className={styles.logPhone}>{log.phone_number.replace('@c.us', '')}</span>
                  <span className={`${styles.logDir} ${log.direction === 'inbound' ? styles.inTag : styles.outTag}`}>
                    {log.direction === 'inbound' ? '← Masuk' : '→ AI Reply'}
                  </span>
                  <span className={styles.logTime}>
                    {new Date(log.created_at).toLocaleString('id-ID', {
                      day: '2-digit', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className={styles.logText}>{log.payload?.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
