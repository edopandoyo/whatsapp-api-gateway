import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface SocketCtxValue {
  socket:      Socket | null;
  connected:   boolean;
  joinSession:  (sessionId: string) => void;
  leaveSession: (sessionId: string) => void;
}

const SocketContext = createContext<SocketCtxValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const socketRef   = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session?.access_token) {
      // Tidak ada sesi — pastikan socket terputus
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    const sock = io(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000', {
      auth: { token: session.access_token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    sock.on('connect',    () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    sock.on('connect_error', (err) => {
      console.warn('[Socket.io] Gagal konek:', err.message);
    });

    // Handle session disconnected event
    sock.on('disconnected', (data: { sessionId: string; reason?: string }) => {
      console.warn('[Socket.io] Sesi terputus:', data);
      toast.error(`Sesi WhatsApp terputus: ${data.reason || 'tidak diketahui'}`);
    });

    socketRef.current = sock;

    return () => {
      sock.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [session?.access_token]);

  const joinSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('join_session', sessionId);
  }, []);

  const leaveSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('leave_session', sessionId);
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, joinSession, leaveSession }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketCtxValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket harus digunakan di dalam <SocketProvider>');
  return ctx;
}
