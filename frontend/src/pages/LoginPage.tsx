import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';

export default function LoginPage() {
  const { signIn }    = useAuth();
  const navigate      = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? 'Login gagal. Periksa email & password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandIcon}><Zap size={20} /></div>
          <span className={styles.brandName}>Masedo Studio</span>
        </div>

        <h1 className={styles.heading}>Selamat datang kembali</h1>
        <p className={styles.sub}>Masuk ke dashboard WhatsApp Gateway Anda</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" autoComplete="email" required
              placeholder="nama@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className={styles.inputWrap}>
              <input
                id="password" type={showPass ? 'text' : 'password'}
                autoComplete="current-password" required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button" className={styles.eyeBtn}
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Masuk…' : 'Masuk'}
          </button>
        </form>

        <p className={styles.alt}>
          Belum punya akun? <Link to="/register">Daftar sekarang</Link>
        </p>
      </div>

      {/* BG effect */}
      <div className={styles.glow} aria-hidden />
    </div>
  );
}
