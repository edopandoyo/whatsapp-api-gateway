import { useEffect, useState, useCallback } from 'react';
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Loader2, Inbox, MessageSquare, Send,
} from 'lucide-react';
import api from '../lib/api';
import type { MessageLog, MessageStatus } from '../types';
import styles from './LogsPage.module.css';

type DirectionFilter = 'all' | 'inbound' | 'outbound';
type StatusFilter = 'all' | 'sent' | 'failed' | 'received';

export default function LogsPage() {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Filters
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sessionId, setSessionId] = useState<string>('all');
  const [sessions, setSessions] = useState<{ id: string; name: string }[]>([]);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(direction !== 'all' && { direction }),
      ...(status !== 'all' && { status }),
      ...(sessionId !== 'all' && { session_id: sessionId }),
    });

    api.get<{ data: MessageLog[]; meta: { total: number } }>(`/api/internal/messages?${params}`)
      .then(r => {
        setLogs(r.data.data);
        setTotal(r.data.meta.total);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [limit, offset, direction, status, sessionId]);

  const fetchSessions = useCallback(() => {
    api.get<{ data: { id: string; name: string }[] }>('/api/internal/sessions')
      .then(r => setSessions(r.data.data))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const goToPage = (page: number) => {
    const newOffset = (page - 1) * limit;
    setOffset(Math.max(0, Math.min(newOffset, (totalPages - 1) * limit)));
  };

  const getStatusBadge = (log: MessageLog) => {
    const statusMap: Record<MessageStatus, { label: string; cls: string }> = {
      sent: { label: 'Terkirim', cls: 'badge--success' },
      failed: { label: 'Gagal', cls: 'badge--error' },
      received: { label: 'Diterima', cls: 'badge--info' },
    };
    const { label, cls } = statusMap[log.status] || statusMap.failed;
    return (
      <span className={`badge ${cls}`}>
        <span className="badge-dot" style={{ background: 'currentColor' }} />
        {label}
      </span>
    );
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Activity Log</h1>
          <p className={styles.sub}>Riwayat pesan masuk dan keluar</p>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label><Search size={14} /> Pencarian</label>
          <input
            type="text"
            placeholder="Cari nomor atau pesan..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <label><Filter size={14} /> Arah</label>
          <select
            value={direction}
            onChange={(e) => { setDirection(e.target.value as DirectionFilter); setOffset(0); }}
            className={styles.select}
          >
            <option value="all">Semua</option>
            <option value="inbound">Masuk</option>
            <option value="outbound">Keluar</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label><Filter size={14} /> Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as StatusFilter); setOffset(0); }}
            className={styles.select}
          >
            <option value="all">Semua</option>
            <option value="sent">Terkirim</option>
            <option value="failed">Gagal</option>
            <option value="received">Diterima</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label><Filter size={14} /> Sesi</label>
          <select
            value={sessionId}
            onChange={(e) => { setSessionId(e.target.value); setOffset(0); }}
            className={styles.select}
          >
            <option value="all">Semua Sesi</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={28} className="animate-spin" color="var(--c-brand-500)" />
        </div>
      ) : logs.length === 0 ? (
        <div className={styles.empty}>
          <Inbox size={48} color="var(--c-text-3)" />
          <p>Belum ada log aktivitas</p>
          <p style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            Pesan yang dikirim atau diterima akan muncul di sini
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Arah</th>
                  <th>Sesi</th>
                  <th>Nomor</th>
                  <th>Pesan</th>
                  <th>Tipe</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className={styles.timeCell}>
                      {new Date(log.created_at).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className={styles.directionBadge} data-dir={log.direction}>
                        {log.direction === 'inbound' ? (
                          <><Inbox size={12} /> Masuk</>
                        ) : (
                          <><Send size={12} /> Keluar</>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={styles.sessionName}>
                        {sessions.find(s => s.id === log.session_id)?.name || log.session_id.slice(0, 8)}
                      </span>
                    </td>
                    <td className={styles.numberCell}>
                      {log.direction === 'inbound' ? log.from_number : log.to_number}
                    </td>
                    <td className={styles.messageCell}>
                      <MessageSquare size={12} className={styles.msgIcon} />
                      <span title={log.content_preview || '(media)'}>
                        {log.content_preview || '(media)'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.typeBadge}>{log.message_type}</span>
                    </td>
                    <td>{getStatusBadge(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageInfo}>
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                className={styles.pageBtn}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
