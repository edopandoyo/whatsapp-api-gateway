import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate   = useNavigate();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Password tidak cocok'); return; }
    if (password.length < 8)  { toast.error('Password minimal 8 karakter'); return; }
    try {
      setLoading(true);
      await signUp(email, password);
      toast.success('Akun dibuat! Silakan cek email verifikasi Anda.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.message ?? 'Pendaftaran gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><Zap size={20} /></div>
          <span className={styles.brandName}>Masedo Studio</span>
        </div>

        <h1 className={styles.heading}>Buat akun baru</h1>
        <p className={styles.sub}>Mulai kelola WhatsApp Gateway gratis</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required
              placeholder="nama@contoh.com" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className={styles.inputWrap}>
              <input id="password" type={showPass ? 'text' : 'password'}
                autoComplete="new-password" required placeholder="Min. 8 karakter"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className={styles.eyeBtn}
                onClick={() => setShowPass(!showPass)} aria-label="Toggle password">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="confirm">Konfirmasi Password</label>
            <input id="confirm" type={showPass ? 'text' : 'password'}
              autoComplete="new-password" required placeholder="Ulangi password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Mendaftar…' : 'Daftar'}
          </button>
        </form>

        <p className={styles.alt}>
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </div>
      <div className={styles.glow} aria-hidden />
    </div>
  );
}
