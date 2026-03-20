import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { SocketProvider } from '../context/SocketContext';
import { Menu, X } from 'lucide-react';
import styles from './DashboardLayout.module.css';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SocketProvider>
      <div className={styles.layout}>
        {/* Mobile top bar */}
        <header className={styles.mobileHeader}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={22} />
          </button>
          <span className={styles.mobileTitle}>Masedo Studio</span>
        </header>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className={styles.overlay}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar – always visible on desktop, drawer on mobile */}
        <div className={`${styles.sidebarWrapper} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <button
            className={styles.closeBtn}
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
          <Sidebar onNavClick={() => setSidebarOpen(false)} />
        </div>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}
