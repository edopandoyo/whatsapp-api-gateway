import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Smartphone, FileText,
  Settings, LogOut, Zap, Wifi, WifiOff,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dashboard/sessions', icon: Smartphone, label: 'Sesi WhatsApp' },
  { to: '/dashboard/logs', icon: FileText, label: 'Activity Log' },
  { to: '/dashboard/settings', icon: Settings, label: 'Pengaturan' },
  { to: '/dashboard/documentations', icon: BookOpen, label: 'Dokumentasi' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      toast.error('Gagal sign out');
    }
  };

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <Zap size={18} />
        </div>
        <div>
          <p className={styles.brandName}>Masedo Studio</p>
          <p className={styles.brandSub}>WA Gateway</p>
        </div>
      </div>

      {/* WS Status */}
      <div className={styles.wsStatus}>
        {connected
          ? <><Wifi size={13} color="var(--c-success)" /> <span style={{ color: 'var(--c-success)' }}>Realtime aktif</span></>
          : <><WifiOff size={13} color="var(--c-text-2)" /> <span style={{ color: 'var(--c-text-2)' }}>Menghubungkan…</span></>
        }
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
            }
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.userEmail} title={user?.email}>{user?.email}</p>
        <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign out">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
