import { useEffect, useRef } from 'react';
import {
  X, Inbox, Send, Clock, Hash, User, MessageSquare,
  Tag, AlertCircle, Code, ArrowRight,
  Image, FileText, Video, Music, Sticker, Paperclip, Link2,
} from 'lucide-react';
import type { MessageLog } from '../types';
import styles from './LogDetailModal.module.css';

// Map media type_label to Lucide icon
const mediaIcon: Record<string, React.ElementType> = {
  Image: Image, Video: Video, Audio: Music,
  Document: FileText, Sticker: Sticker,
};

interface Props {
  log: MessageLog;
  sessionName?: string;
  onClose: () => void;
}

const cleanNumber = (n: string | null | undefined) =>
  n ? n.replace(/@c\.us$/i, '').replace(/@s\.whatsapp\.net$/i, '') : '—';

const statusLabel: Record<string, { label: string; cls: string }> = {
  sent:     { label: 'Terkirim',  cls: 'badge--success' },
  failed:   { label: 'Gagal',     cls: 'badge--error' },
  received: { label: 'Diterima',  cls: 'badge--info' },
  delivered:{ label: 'Terkirim',  cls: 'badge--success' },
  read:     { label: 'Dibaca',    cls: 'badge--success' },
};

const sourceLabel: Record<string, string> = {
  api_call: 'API Call',
  ai_reply: 'AI Auto Reply',
  manual:   'Manual',
};

export default function LogDetailModal({ log, sessionName, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const phone = cleanNumber(log.direction === 'inbound' ? log.from_number : log.to_number);
  const st = statusLabel[log.status] || statusLabel.failed;
  const isInbound = log.direction === 'inbound';

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.dirBadge} data-dir={log.direction}>
              {isInbound ? <Inbox size={13} /> : <Send size={13} />}
              {isInbound ? 'Pesan Masuk' : 'Pesan Keluar'}
            </span>
            <h2 className={styles.title}>Detail Log</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Info grid */}
          <div className={styles.grid}>
            <InfoItem icon={<Clock size={13} />} label="Waktu">
              {new Date(log.created_at).toLocaleString('id-ID', {
                day: '2-digit', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </InfoItem>

            <InfoItem icon={<User size={13} />} label="Sesi">
              {sessionName || log.session_id.slice(0, 8) + '...'}
            </InfoItem>

            <InfoItem icon={<Hash size={13} />} label="Nomor">
              <span className={styles.mono}>{phone}</span>
            </InfoItem>

            <InfoItem icon={<Tag size={13} />} label="Tipe Pesan">
              <span className={styles.typeBadge}>{log.message_type}</span>
            </InfoItem>

            <InfoItem icon={<ArrowRight size={13} />} label="Status">
              <span className={`badge ${st.cls}`}>
                <span className="badge-dot" style={{ background: 'currentColor' }} />
                {st.label}
              </span>
            </InfoItem>

            {log.source && (
              <InfoItem icon={<Code size={13} />} label="Sumber">
                {sourceLabel[log.source] || log.source}
              </InfoItem>
            )}

            {log.wa_message_id && (
              <InfoItem icon={<Hash size={13} />} label="WA Message ID">
                <span className={styles.monoSm}>{log.wa_message_id}</span>
              </InfoItem>
            )}
          </div>

          {/* Message content */}
          {log.media_meta ? (
            /* ── Rich media card ── */
            <div className={styles.section}>
              <span className={styles.sectionLabel}>
                {(() => { const I = mediaIcon[log.media_meta!.type_label] || Paperclip; return <I size={13} />; })()}
                Media
              </span>
              <div className={styles.mediaCard}>
                {/* Media header row */}
                <div className={styles.mediaHeader}>
                  {(() => { const I = mediaIcon[log.media_meta.type_label] || Paperclip; return <I size={20} />; })()}
                  <div className={styles.mediaHeaderText}>
                    <span className={styles.mediaTypeLabel}>{log.media_meta.type_label}</span>
                    {log.media_meta.mimetype && (
                      <span className={styles.mimeType}>{log.media_meta.mimetype}</span>
                    )}
                  </div>
                </div>

                {/* Details rows */}
                <div className={styles.mediaDetails}>
                  {log.media_meta.filename && (
                    <div className={styles.mediaRow}>
                      <FileText size={12} />
                      <span className={styles.mediaRowLabel}>File</span>
                      <span className={styles.mediaRowValue}>{log.media_meta.filename}</span>
                    </div>
                  )}
                  {log.media_meta.caption && (
                    <div className={styles.mediaRow}>
                      <MessageSquare size={12} />
                      <span className={styles.mediaRowLabel}>Caption</span>
                      <span className={styles.mediaRowValue}>{log.media_meta.caption}</span>
                    </div>
                  )}
                  {log.media_meta.mediaUrl && (
                    <div className={styles.mediaRow}>
                      <Link2 size={12} />
                      <span className={styles.mediaRowLabel}>URL</span>
                      <a
                        className={styles.mediaRowLink}
                        href={log.media_meta.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                      >
                        {log.media_meta.mediaUrl}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Text message ── */
            <div className={styles.section}>
              <span className={styles.sectionLabel}>
                <MessageSquare size={13} /> Isi Pesan
              </span>
              <div className={styles.messageBox}>
                {log.content_preview ? (
                  <p className={styles.messageText}>{log.content_preview}</p>
                ) : (
                  <div className={styles.mediaHint}>
                    <MessageSquare size={16} />
                    <span>Tidak ada konten teks</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {log.status === 'failed' && log.error_message && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>
                <AlertCircle size={13} /> Error
              </span>
              <div className={styles.errorBox}>
                {log.error_message}
              </div>
            </div>
          )}

          {/* Payload JSON */}
          {log.payload && Object.keys(log.payload).length > 0 && (
            <details className={styles.payloadSection}>
              <summary className={styles.payloadToggle}>
                <Code size={13} /> Payload JSON
              </summary>
              <pre className={styles.payloadPre}>
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </details>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── InfoItem sub-component ── */
function InfoItem({
  icon, label, children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.infoItem}>
      <span className={styles.infoLabel}>
        {icon} {label}
      </span>
      <div className={styles.infoValue}>{children}</div>
    </div>
  );
}
