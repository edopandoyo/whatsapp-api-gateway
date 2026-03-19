import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../context/SocketContext';
import type { Session } from '../types';
import styles from './QrModal.module.css';

interface Props {
  session: Session;
  onClose: () => void;
  onReady: () => void;
}

export default function QrModal({ session, onClose, onReady }: Props) {
  const { socket, joinSession, leaveSession } = useSocket();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('waiting');
  const [expired, setExpired] = useState(false);

  // Hadiri room socket sesi ini
  useEffect(() => {
    joinSession(session.id);
    return () => leaveSession(session.id);
  }, [session.id, joinSession, leaveSession]);

  // Listen event real-time
  useEffect(() => {
    if (!socket) return;

    const handleQr = (data: { session_id: string; qr_string: string }) => {
      console.log('QR diterima', data);
      if (data.session_id !== session.id) return;
      setQr(data.qr_string);
      setStatus('scan');
      setExpired(false);
    };

    const handleAuth = (data: { session_id: string }) => {
      if (data.session_id !== session.id) return;
      setStatus('authenticated');
    };

    const handleReady = (data: { session_id: string; phone_number: string }) => {
      if (data.session_id !== session.id) return;
      setStatus('ready');
      setTimeout(() => { onReady(); onClose(); }, 1200);
    };

    const handleFail = (data: { session_id: string }) => {
      if (data.session_id !== session.id) return;
      setStatus('failed');
    };

    socket.on('qr', handleQr);
    socket.on('authenticated', handleAuth);
    socket.on('ready', handleReady);
    socket.on('auth_failure', handleFail);

    return () => {
      socket.off('qr', handleQr);
      socket.off('authenticated', handleAuth);
      socket.off('ready', handleReady);
      socket.off('auth_failure', handleFail);
    };
  }, [socket, session.id, onReady, onClose]);

  // QR expire 60 detik
  useEffect(() => {
    if (!qr) return;
    const t = setTimeout(() => setExpired(true), 60_000);
    return () => clearTimeout(t);
  }, [qr]);

  const statusMsg: Record<string, string> = {
    waiting: 'Memuat QR Code…',
    scan: 'Scan dengan WhatsApp di ponsel Anda',
    authenticated: 'Berhasil discan! Menyelesaikan login…',
    ready: '✅ Terhubung! Menutup…',
    failed: 'Autentikasi gagal. Coba scan lagi.',
  };

  return (
    <div className={styles.overlay} onClick={onClose} aria-modal="true" role="dialog">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Hubungkan WhatsApp</p>
            <p className={styles.subtitle}>{session.session_name}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* QR Area */}
        <div className={styles.qrArea}>
          {expired ? (
            <div className={styles.expiredBox}>
              <RefreshCw size={32} className="animate-spin" color="var(--c-text-2)" />
              <p style={{ color: 'var(--c-text-2)', marginTop: 12 }}>QR kedaluwarsa</p>
              <button
                className={styles.refreshBtn}
                onClick={() => { setExpired(false); setQr(null); setStatus('waiting'); }}
              >
                Muat Ulang
              </button>
            </div>
          ) : qr ? (
            <div
              className={styles.qrBox}
              style={{ opacity: status === 'authenticated' || status === 'ready' ? 0.3 : 1 }}
            >
              <QRCodeSVG value={qr} size={220} bgColor="transparent" fgColor="#FFFFFF" level="M" />
            </div>
          ) : (
            <div className={styles.skeleton} />
          )}
        </div>

        {/* Status */}
        <div className={styles.statusBar}>
          <div
            className={`${styles.dot} ${status === 'ready' ? styles.dotReady : status === 'failed' ? styles.dotFailed : styles.dotPulse}`}
          />
          <p>{statusMsg[status] ?? ''}</p>
        </div>

        {/* Steps */}
        <ol className={styles.steps}>
          <li>Buka WhatsApp → Perangkat Tertaut → Tautkan perangkat</li>
          <li>Arahkan kamera ke QR Code di atas</li>
          <li>Tunggu konfirmasi koneksi</li>
        </ol>
      </div>
    </div>
  );
}
