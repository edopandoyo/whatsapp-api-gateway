import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { SocketProvider } from '../context/SocketContext';
import styles from './DashboardLayout.module.css';

export default function DashboardLayout() {
  return (
    <SocketProvider>
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}
