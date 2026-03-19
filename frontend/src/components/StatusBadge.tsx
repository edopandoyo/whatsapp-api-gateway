import type { SessionStatus } from '../types';

const MAP: Record<SessionStatus, { label: string; cls: string }> = {
  connected:    { label: 'Terhubung',    cls: 'badge--connected' },
  pending:      { label: 'Menunggu QR',  cls: 'badge--pending' },
  connecting:   { label: 'Menghubungkan',cls: 'badge--connecting' },
  disconnected: { label: 'Terputus',     cls: 'badge--disconnected' },
  auth_failure: { label: 'Auth Gagal',   cls: 'badge--disconnected' },
};

export default function StatusBadge({ status }: { status: SessionStatus }) {
  const { label, cls } = MAP[status] ?? MAP.disconnected;
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" style={{ background: 'currentColor' }} />
      {label}
    </span>
  );
}
