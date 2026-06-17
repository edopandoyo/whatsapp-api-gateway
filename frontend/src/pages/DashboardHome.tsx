import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, MessageSquare, Activity,
  TrendingUp, ArrowRight, Zap, Inbox, Send,
} from 'lucide-react';
import api from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Session, MessageLog } from '../types';
import StatusBadge from '../components/StatusBadge';
import styles from './DashboardHome.module.css';

const cleanNumber = (n: string | null | undefined) =>
  n ? n.replace(/@c\.us$/i, '').replace(/@s\.whatsapp\.net$/i, '') : '—';

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  return `${days}h lalu`;
};

export default function DashboardHome() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loadingS, setLoadingS] = useState(true);
  const [loadingL, setLoadingL] = useState(true);

  const fetchLogs = useCallback(() => {
    api.get<{ data: MessageLog[]; meta: { total: number } }>(
      '/api/internal/messages?limit=10'
    )
      .then(r => setLogs(r.data.data))
      .catch(() => setLogs([]))
      .finally(() => setLoadingL(false));
  }, []);

  useEffect(() => {
    api.get<{ data: Session[] }>('/api/internal/sessions')
      .then(r => setSessions(r.data.data))
      .catch(() => setSessions([]))
      .finally(() => setLoadingS(false));

    fetchLogs();
  }, [fetchLogs]);

  // Supabase Realtime: live updates
  useEffect(() => {
    const channel = supabase
      .channel('dashboard:message_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_logs' },
        () => { fetchLogs(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLogs]);

  const connected = sessions.filter(s => s.status === 'connected').length;
  const pending   = sessions.filter(s => s.status === 'pending' || s.status === 'connecting').length;
  const inbound   = logs.filter(l => l.direction === 'inbound').length;
  const outbound  = logs.filter(l => l.direction === 'outbound').length;

  const stats = [
    { icon: Smartphone,    label: 'Total Sesi',          value: sessions.length, sub: `${connected} terhubung` },
    { icon: MessageSquare, label: 'Pesan Masuk Terbaru', value: inbound,          sub: 'Dari 10 log terakhir' },
    { icon: Activity,      label: 'Pesan Keluar Terbaru', value: outbound,        sub: 'Dari 10 log terakhir' },
    { icon: TrendingUp,    label: 'Sesi Aktif',          value: connected + pending, sub: 'Terhubung + Pending' },
  ];

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Dashboard</h1>
          <p className={styles.headerSub}>Selamat datang di Masedo Studio WhatsApp Gateway</p>
        </div>
        <button
          className={styles.ctaBtn}
          onClick={() => navigate('/dashboard/sessions')}
        >
          <Zap size={15} />
          Kelola Sesi
        </button>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className={styles.statCard}>
            <div className={styles.statIcon}><Icon size={18} /></div>
            <div>
              <p className={styles.statValue}>
                {(loadingS || loadingL) ? (
                  <span className={styles.skeleton} style={{ width: 40, height: 24, borderRadius: 6, display: 'inline-block' }} />
                ) : value}
              </p>
              <p className={styles.statLabel}>{label}</p>
              <p className={styles.statSub}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className={styles.grid}>
        {/* Sesi terbaru */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Sesi Aktif</h2>
            <button className={styles.viewAll} onClick={() => navigate('/dashboard/sessions')}>
              Lihat semua <ArrowRight size={13} />
            </button>
          </div>
          {loadingS ? (
            <div className={styles.emptyBox}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '3px solid var(--c-border)', borderTopColor: 'var(--c-brand-500)', borderRadius: '50%' }} />
            </div>
          ) : sessions.length === 0 ? (
            <div className={styles.emptyBox}>
              <Smartphone size={36} color="var(--c-text-3)" />
              <p>Belum ada sesi</p>
              <button className={styles.smallBtn} onClick={() => navigate('/dashboard/sessions')}>
                Tambah Sesi
              </button>
            </div>
          ) : (
            <ul className={styles.sessionList}>
              {sessions.slice(0, 5).map(s => (
                <li key={s.id} className={styles.sessionItem}>
                  <div className={styles.sessionInfo}>
                    <span className={styles.sessionName}>{s.session_name}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <span className={styles.sessionDate}>
                    {s.last_connected_at
                      ? new Date(s.last_connected_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Log terbaru */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Aktivitas Terbaru</h2>
            <button className={styles.viewAll} onClick={() => navigate('/dashboard/logs')}>
              Lihat semua <ArrowRight size={13} />
            </button>
          </div>
          {loadingL ? (
            <div className={styles.emptyBox}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '3px solid var(--c-border)', borderTopColor: 'var(--c-brand-500)', borderRadius: '50%' }} />
            </div>
          ) : logs.length === 0 ? (
            <div className={styles.emptyBox}>
              <MessageSquare size={36} color="var(--c-text-3)" />
              <p>Belum ada aktivitas</p>
            </div>
          ) : (
            <ul className={styles.logList}>
              {logs.slice(0, 8).map(l => {
                const isIn = l.direction === 'inbound';
                const phone = cleanNumber(isIn ? l.from_number : l.to_number);
                const sessionName = sessions.find(s => s.id === l.session_id)?.session_name;
                return (
                  <li key={l.id} className={styles.logItem}>
                    <div
                      className={styles.logDirIcon}
                      data-dir={l.direction}
                    >
                      {isIn ? <Inbox size={13} /> : <Send size={13} />}
                    </div>
                    <div className={styles.logInfo}>
                      <div className={styles.logTopRow}>
                        <span className={styles.logNum}>{phone}</span>
                        <span className={styles.logTime}>{timeAgo(l.created_at)}</span>
                      </div>
                      <span className={styles.logPrev}>
                        {l.content_preview || '(media)'}
                      </span>
                      {sessionName && (
                        <span className={styles.logSession}>{sessionName}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
