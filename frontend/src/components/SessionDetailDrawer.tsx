import { useEffect, useRef, useState } from 'react';
import { X, Smartphone, Globe, Bot, ScrollText } from 'lucide-react';
import type { Session } from '../types';
import StatusBadge from '../components/StatusBadge';
import AIConfigTab from '../components/AIConfigTab';
import styles from './SessionDetailDrawer.module.css';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type Tab = 'info' | 'ai';

interface Props {
  session: Session;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// INFO TAB
// ─────────────────────────────────────────────

function InfoTab({ session }: { session: Session }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 24px' }}>
      {/* Detail rows */}
      <InfoRow label="Session ID" value={session.id} mono />
      <InfoRow label="Nama Sesi"  value={session.session_name} />
      <InfoRow
        label="Nomor WhatsApp"
        value={session.phone_number ?? '—'}
      />
      <InfoRow label="Status">
        <StatusBadge status={session.status} />
      </InfoRow>
      {session.webhook_url && (
        <InfoRow label="Webhook URL" value={session.webhook_url} mono />
      )}
      <InfoRow
        label="Dibuat"
        value={new Date(session.created_at).toLocaleString('id-ID')}
      />
      {session.updated_at && (
        <InfoRow
          label="Diperbarui"
          value={new Date(session.updated_at).toLocaleString('id-ID')}
        />
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--c-text-3, #777)',
      }}>
        {label}
      </span>
      {children ?? (
        <span style={{
          fontSize: 13,
          color: 'var(--c-text-1, #f0f0f0)',
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-all',
        }}>
          {value}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DRAWER
// ─────────────────────────────────────────────

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'info', label: 'Info Sesi',   Icon: ScrollText },
  { id: 'ai',   label: 'AI Auto Reply', Icon: Bot },
];

export default function SessionDetailDrawer({ session, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('info');
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

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={styles.drawer}>

        {/* ── Drawer Header ── */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleRow}>
            <div className={styles.drawerIcon}>
              <Smartphone size={16} />
            </div>
            <div className={styles.drawerTitleText}>
              <h2 className={styles.drawerTitle}>{session.session_name}</h2>
              {session.phone_number && (
                <p className={styles.drawerPhone}>
                  <Globe size={11} />
                  {session.phone_number}
                </p>
              )}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={13} />
              {label}
              {id === 'ai' && (
                <span className={styles.aiBadge}>AI</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className={styles.drawerBody}>
          {activeTab === 'info' && <InfoTab session={session} />}
          {activeTab === 'ai'   && <AIConfigTab session={session} />}
        </div>

      </div>
    </div>
  );
}
