import { useEffect, useState, useCallback } from 'react';
import {
  Key, Globe, Plus, CheckCircle, XCircle,
  Loader2, Shield, Zap, ExternalLink, Copy,
} from 'lucide-react';
import api from '../lib/api';
import type { ApiKey, Session } from '../types';
import ApiKeyModal from '../components/ApiKeyModal';
import toast from 'react-hot-toast';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);

  const [webhookUpdating, setWebhookUpdating] = useState<Record<string, boolean>>({});
  const [webhookValues, setWebhookValues] = useState<Record<string, string>>({});

  const fetchApiKeys = useCallback(() => {
    setLoadingKeys(true);
    api.get<{ data: ApiKey[] }>('/api/internal/api-keys')
      .then(r => setApiKeys(r.data.data))
      .catch(() => toast.error('Gagal memuat API Keys'))
      .finally(() => setLoadingKeys(false));
  }, []);

  const fetchSessions = useCallback(() => {
    setLoadingSessions(true);
    api.get<{ data: Session[] }>('/api/internal/sessions')
      .then(r => {
        setSessions(r.data.data);
        const webhooks: Record<string, string> = {};
        r.data.data.forEach(s => {
          if (s.webhook_url) webhooks[s.id] = s.webhook_url;
        });
        setWebhookValues(webhooks);
      })
      .catch(() => toast.error('Gagal memuat sesi'))
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => {
    fetchApiKeys();
    fetchSessions();
  }, [fetchApiKeys, fetchSessions]);

  const createApiKey = async (label: string) => {
    try {
      setCreatingKey(true);
      const { data } = await api.post<{ data: ApiKey }>('/api/internal/api-keys', { label });
      setApiKeys(prev => [data.data, ...prev]);
      toast.success('API Key berhasil dibuat!');
      setShowKeyModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Gagal membuat API Key');
      throw err;
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    if (!confirm('Nonaktifkan API Key ini? Aplikasi yang menggunakan key ini akan kehilangan akses.')) return;
    try {
      await api.delete(`/api/internal/api-keys/${id}`);
      setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k));
      toast.success('API Key dinonaktifkan');
    } catch {
      toast.error('Gagal menonaktifkan API Key');
    }
  };

  const copyApiKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    toast.success('API Key disalin');
  };

  const updateWebhook = async (sessionId: string) => {
    try {
      setWebhookUpdating(prev => ({ ...prev, [sessionId]: true }));
      await api.patch(`/api/internal/sessions/${sessionId}`, {
        webhook_url: webhookValues[sessionId] || null,
      });
      toast.success('Webhook URL diperbarui');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Gagal update webhook');
    } finally {
      setWebhookUpdating(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const testWebhook = async (sessionId: string, webhookUrl: string) => {
    if (!webhookUrl) {
      toast.error('Webhook URL belum diatur');
      return;
    }
    try {
      await api.post(`/api/internal/sessions/${sessionId}/test-webhook`);
      toast.success('Test webhook dikirim! Cek endpoint Anda.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Gagal mengirim test webhook');
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Pengaturan</h1>
          <p className={styles.sub}>Kelola API Keys dan Webhook</p>
        </div>
      </div>

      {/* API Keys Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <Key size={20} />
            <h2>API Keys</h2>
          </div>
          <button className={styles.addBtn} onClick={() => setShowKeyModal(true)}>
            <Plus size={15} />
            Buat API Key
          </button>
        </div>

        <p className={styles.sectionDesc}>
          Gunakan API Key untuk mengakses API dari sistem eksternal. Jaga kerahasiaan key Anda.
        </p>

        {loadingKeys ? (
          <div className={styles.loading}>
            <Loader2 size={28} className="animate-spin" color="var(--c-brand-500)" />
          </div>
        ) : apiKeys.length === 0 ? (
          <div className={styles.empty}>
            <Shield size={40} color="var(--c-text-3)" />
            <p>Belum ada API Key</p>
            <p style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              Buat API Key pertama Anda untuk mulai mengirim pesan
            </p>
          </div>
        ) : (
          <div className={styles.keysGrid}>
            {apiKeys.map(key => (
              <div key={key.id} className={styles.keyCard}>
                <div className={styles.keyHeader}>
                  <div className={styles.keyInfo}>
                    <Key size={16} color={key.is_active ? 'var(--c-brand-500)' : 'var(--c-text-3)'} />
                    <span className={styles.keyLabel}>{key.label}</span>
                  </div>
                  <span className={styles.keyStatus} data-active={key.is_active}>
                    {key.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                {key.api_key ? (
                  <div className={styles.keyValue}>
                    <code>{key.api_key}</code>
                    <button
                      className={styles.copyKeyBtn}
                      onClick={() => copyApiKey(key.api_key!)}
                      title="Salin"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                ) : (
                  <p className={styles.keyHidden}>••••••••••••••••</p>
                )}

                <div className={styles.keyMeta}>
                  <span>Dibuat: {new Date(key.created_at).toLocaleDateString('id-ID')}</span>
                  {key.last_used_at ? (
                    <span>Terakhir: {new Date(key.last_used_at).toLocaleDateString('id-ID')}</span>
                  ) : (
                    <span>Belum pernah digunakan</span>
                  )}
                </div>

                {key.is_active && (
                  <button
                    className={styles.revokeBtn}
                    onClick={() => revokeApiKey(key.id)}
                  >
                    <XCircle size={14} />
                    Nonaktifkan
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Webhooks Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <Globe size={20} />
            <h2>Webhook URLs</h2>
          </div>
        </div>

        <p className={styles.sectionDesc}>
          Konfigurasi webhook untuk menerima notifikasi pesan masuk dan status update.
        </p>

        {loadingSessions ? (
          <div className={styles.loading}>
            <Loader2 size={28} className="animate-spin" color="var(--c-brand-500)" />
          </div>
        ) : sessions.length === 0 ? (
          <div className={styles.empty}>
            <Globe size={40} color="var(--c-text-3)" />
            <p>Belum ada sesi</p>
            <p style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              Buat sesi WhatsApp terlebih dahulu
            </p>
          </div>
        ) : (
          <div className={styles.webhooksList}>
            {sessions.map(session => (
              <div key={session.id} className={styles.webhookCard}>
                <div className={styles.webhookHeader}>
                  <div className={styles.webhookInfo}>
                    <Zap size={16} color="var(--c-brand-500)" />
                    <span className={styles.webhookSession}>{session.session_name}</span>
                  </div>
                  <span className={styles.sessionStatus} data-status={session.status}>
                    {session.status === 'connected' ? 'Terhubung' : session.status}
                  </span>
                </div>

                <div className={styles.webhookInput}>
                  <input
                    type="url"
                    placeholder="https://your-domain.com/webhook"
                    value={webhookValues[session.id] || ''}
                    onChange={(e) => setWebhookValues(prev => ({
                      ...prev,
                      [session.id]: e.target.value,
                    }))}
                    disabled={webhookUpdating[session.id]}
                  />
                  <button
                    className={styles.saveBtn}
                    onClick={() => updateWebhook(session.id)}
                    disabled={webhookUpdating[session.id]}
                  >
                    {webhookUpdating[session.id] ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                  </button>
                </div>

                {webhookValues[session.id] && (
                  <div className={styles.webhookActions}>
                    <button
                      className={styles.testBtn}
                      onClick={() => testWebhook(session.id, webhookValues[session.id])}
                    >
                      <ExternalLink size={12} />
                      Test Webhook
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onCreate={createApiKey}
        loading={creatingKey}
      />
    </div>
  );
}
