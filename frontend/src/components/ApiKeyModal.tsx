import React, { useState } from 'react';
import { X, Copy, Check, Key, Loader2 } from 'lucide-react';
import styles from './ApiKeyModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (label: string) => Promise<void>;
  loading: boolean;
}

export default function ApiKeyModal({ isOpen, onClose, onCreate, loading }: Props) {
  const [label, setLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    await onCreate(label.trim());
    setLabel('');
  };

  const handleCopy = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setCreatedKey(null);
    setLabel('');
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose} aria-modal="true" role="dialog">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <p className={styles.title}>
              {createdKey ? 'API Key Dibuat' : 'Buat API Key Baru'}
            </p>
            <p className={styles.subtitle}>
              {createdKey
                ? 'Simpan key ini dengan aman. Tidak akan ditampilkan lagi.'
                : 'Generate API key untuk akses API eksternal'}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {createdKey ? (
          <div className={styles.createdContent}>
            <div className={styles.keyDisplay}>
              <Key size={20} color="var(--c-brand-500)" />
              <code className={styles.keyValue}>{createdKey}</code>
              <button
                className={styles.copyBtn}
                onClick={handleCopy}
                title="Salin API Key"
              >
                {copied ? <Check size={16} color="var(--c-success)" /> : <Copy size={16} />}
              </button>
            </div>
            {copied && (
              <p className={styles.copiedMsg} style={{ color: 'var(--c-success)' }}>
                ✓ Disalin ke clipboard
              </p>
            )}
            <div className={styles.warningBox}>
              <p style={{ fontSize: 13, color: 'var(--c-warning)', margin: 0 }}>
                ⚠️ Jangan bagikan API Key ini! Simpan di tempat yang aman.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="label">Label / Nama</label>
              <input
                id="label"
                type="text"
                placeholder="misal: Production Server, Marketing Bot"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading || !label.trim()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
              {loading ? 'Membuat...' : 'Generate API Key'}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          {createdKey ? (
            <button className={styles.doneBtn} onClick={handleClose}>
              Selesai
            </button>
          ) : (
            <button className={styles.cancelBtn} onClick={handleClose}>
              Batal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
