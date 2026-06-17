import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Loader2, Inbox, MessageSquare, Send,
  Image, FileText, Video, Music, Sticker, Paperclip,
} from 'lucide-react';
import api from '../lib/api';
import { supabase } from '../lib/supabase';
import type { MessageLog, MessageStatus } from '../types';
import LogDetailModal from '../components/LogDetailModal';
import styles from './LogsPage.module.css';

// Map media type label to the matching Lucide icon
const mediaIconMap: Record<string, React.ElementType> = {
  Image:    Image,
  Video:    Video,
  Audio:    Music,
  Document: FileText,
  Sticker:  Sticker,
};

const MEDIA_TYPES = ['media', 'image', 'document', 'video', 'audio', 'sticker'];

/**
 * Transform a raw DB row from Supabase Realtime into the frontend MessageLog shape.
 * Mirrors the backend extractContentPreview + buildMediaMeta logic.
 */
function transformRawLog(row: Record<string, unknown>): MessageLog {
  const payload = (row.payload && typeof row.payload === 'object'
    ? row.payload as Record<string, unknown>
    : {}) as Record<string, unknown>;
  const type = (row.type as string) || 'text';
  const direction = (row.direction as string) || 'outbound';
  const phoneNumber = (row.phone_number as string) || '';

  // Content preview
  let contentPreview: string | null = null;
  if (type === 'text') {
    contentPreview = (payload.text as string) || null;
  } else if (MEDIA_TYPES.includes(type)) {
    const caption  = (payload.caption || payload.text) as string | undefined || null;
    const filename = (payload.filename as string) || null;
    if (caption)       contentPreview = caption;
    else if (filename) contentPreview = `\uD83D\uDCCE ${filename}`;
    else {
      const mime = (payload.mimetype as string) || '';
      const cat  = mime.split('/')[0];
      const labelMap: Record<string, string> = { image: 'Image', video: 'Video', audio: 'Audio', application: 'Document' };
      const label = type !== 'media' && type !== 'text'
        ? type.charAt(0).toUpperCase() + type.slice(1)
        : labelMap[cat] || 'File';
      contentPreview = `[${label}]`;
    }
  } else {
    contentPreview = (payload.text || payload.caption) as string | null || null;
  }

  // Media meta
  const isMedia = MEDIA_TYPES.includes(type);
  const mediaMeta = isMedia ? {
    mimetype:  (payload.mimetype  as string) || null,
    filename:  (payload.filename  as string) || null,
    caption:   ((payload.caption || payload.text) as string) || null,
    mediaUrl:  (payload.mediaUrl  as string) || null,
    type_label: (() => {
      if (type !== 'media' && type !== 'text') return type.charAt(0).toUpperCase() + type.slice(1);
      const mime = (payload.mimetype as string) || '';
      const cat = mime.split('/')[0];
      return { image: 'Image', video: 'Video', audio: 'Audio', application: 'Document' }[cat] || 'File';
    })(),
  } : null;

  return {
    id:              row.id as string,
    session_id:      row.session_id as string,
    direction:       direction as MessageLog['direction'],
    from_number:     direction === 'inbound' ? phoneNumber : null as unknown as string,
    to_number:       direction === 'outbound' ? phoneNumber : null as unknown as string,
    message_type:    type as MessageLog['message_type'],
    content_preview: contentPreview,
    status:          (row.status as MessageStatus) || 'sent',
    webhook_status:  null,
    created_at:      (row.created_at as string) || new Date().toISOString(),
    media_meta:      mediaMeta,
    wa_message_id:   (row.wa_message_id as string) || null,
    source:          (row.source as string) || null,
    payload:         payload,
    error_message:   (row.error_message as string) || null,
    phone_number:    phoneNumber,
  };
}

type DirectionFilter = 'all' | 'inbound' | 'outbound';
type StatusFilter = 'all' | 'sent' | 'failed' | 'received';

const cleanNumber = (n: string | null | undefined) =>
  n ? n.replace(/@c\.us$/i, '').replace(/@s\.whatsapp\.net$/i, '') : '—';

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
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null);

  // Search with debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
    }, 400);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(direction !== 'all' && { direction }),
      ...(status !== 'all' && { status }),
      ...(sessionId !== 'all' && { session_id: sessionId }),
      ...(debouncedSearch && { search: debouncedSearch }),
    });

    api.get<{ data: MessageLog[]; meta: { total: number } }>(`/api/internal/messages?${params}`)
      .then(r => {
        setLogs(r.data.data);
        setTotal(r.data.meta.total);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [limit, offset, direction, status, sessionId, debouncedSearch]);

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

  // ── Supabase Realtime: live updates for message_logs ──
  useEffect(() => {
    const channel = supabase
      .channel('logs-page:message_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_logs' },
        (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          if (!newRow?.id) return;

          const transformed = transformRawLog(newRow);

          // Session filter: if a specific session is selected, skip others
          if (sessionId !== 'all' && transformed.session_id !== sessionId) return;

          // Direction filter
          if (direction !== 'all' && transformed.direction !== direction) return;

          // Status filter
          if (status !== 'all' && transformed.status !== status) return;

          // Only prepend when on the first page and no active search
          if (offset === 0 && !debouncedSearch) {
            setLogs(prev => {
              // Deduplicate by ID
              if (prev.some(l => l.id === transformed.id)) return prev;
              return [transformed, ...prev].slice(0, limit);
            });
            setTotal(prev => prev + 1);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, direction, status, offset, debouncedSearch, limit]);

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
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
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
                  <tr
                    key={log.id}
                    className={styles.clickableRow}
                    onClick={() => setSelectedLog(log)}
                  >
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
                      {cleanNumber(log.direction === 'inbound' ? log.from_number : log.to_number)}
                    </td>
                    <td className={styles.messageCell}>
                      {log.media_meta ? (
                        <>
                          {(() => {
                            const Icon = mediaIconMap[log.media_meta.type_label] || Paperclip;
                            return <Icon size={12} className={styles.msgIcon} />;
                          })()}
                          <span className={styles.msgText} title={
                            [
                              log.media_meta.type_label,
                              log.media_meta.filename,
                              log.media_meta.caption,
                            ].filter(Boolean).join(' — ')
                          }>
                            <span className={styles.mediaLabel}>{log.media_meta.type_label}</span>
                            {log.media_meta.caption ? (
                              <> — {log.media_meta.caption}</>
                            ) : log.media_meta.filename ? (
                              <> — {log.media_meta.filename}</>
                            ) : null}
                          </span>
                        </>
                      ) : (
                        <>
                          <MessageSquare size={12} className={styles.msgIcon} />
                          <span className={styles.msgText} title={log.content_preview || ''}>
                            {log.content_preview}
                          </span>
                        </>
                      )}
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

      {/* Detail Modal */}
      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          sessionName={sessions.find(s => s.id === selectedLog.session_id)?.name}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
