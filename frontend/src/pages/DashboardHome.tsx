import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, MessageSquare, Activity,
  TrendingUp, ArrowRight, Zap,
} from 'lucide-react';
import api from '../lib/api';
import type { Session, MessageLog } from '../types';
import StatusBadge from '../components/StatusBadge';
import styles from './DashboardHome.module.css';

export default function DashboardHome() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loadingS, setLoadingS] = useState(true);
  const [loadingL, setLoadingL] = useState(true);

  useEffect(() => {
    api.get<{ data: Session[] }>('/api/internal/sessions')
      .then(async r => {
        const sess = r.data.data;
        setSessions(sess);

        // Ambil log dari sesi pertama yang connected
        const active = sess.find(s => s.status === 'connected');
        if (active) {
          const logs = await api.get<{ data: MessageLog[] }>(
            `/api/internal/sessions/${active.id}/messages?limit=5`
          );
          setLogs(logs.data.data);
        }
      })
      .finally(() => { setLoadingS(false); setLoadingL(false); });
  }, []);

  const connected = sessions.filter(s => s.status === 'connected').length;
  const pending = sessions.filter(s => s.status === 'pending' || s.status === 'connecting').length;

  const stats = [
    { icon: Smartphone, label: 'Total Sesi', value: sessions.length, sub: `${connected} terhubung` },
    { icon: MessageSquare, label: 'Pesan Masuk (hari)', value: logs.filter(l => l.direction === 'inbound').length, sub: 'Dari semua sesi' },
    { icon: Activity, label: 'Pesan Keluar (hari)', value: logs.filter(l => l.direction === 'outbound').length, sub: 'Dari semua sesi' },
    { icon: TrendingUp, label: 'Sesi Aktif', value: connected + pending, sub: 'Terhubung + Pending' },
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
              {logs.map(l => (
                <li key={l.id} className={styles.logItem}>
                  <div
                    className={styles.logDot}
                    style={{ background: l.direction === 'inbound' ? 'var(--c-info)' : 'var(--c-brand-500)' }}
                  />
                  <div className={styles.logInfo}>
                    <span className={styles.logNum}>{l.direction === 'inbound' ? l.from_number : l.to_number}</span>
                    <span className={styles.logPrev}>{l.content_preview ?? '(media)'}</span>
                  </div>
                  <span className={styles.logDir}>{l.direction === 'inbound' ? 'Masuk' : 'Keluar'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
