/**
 * @masedo/wa-gateway-sdk - React Hooks (Optional)
 *
 * These hooks are only available when React is installed in the consuming project.
 * Import from '@masedo/wa-gateway-sdk/hooks' to use them.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { WAGatewayClient } from './client';
import type {
    WAGatewayConfig,
    SessionData,
    SessionStatusResponse,
    QRCodeData,
    SessionStatus,
} from './types';

// ============================================================================
// useWAGateway - Create a stable client instance
// ============================================================================

export function useWAGateway(config: WAGatewayConfig): WAGatewayClient {
    const clientRef = useRef<WAGatewayClient | null>(null);
    const configRef = useRef(config);

    // Update config ref on each render (for latest values)
    configRef.current = config;

    // Create client only once (or when baseURL/apiKey changes)
    if (
        clientRef.current === null ||
        clientRef.current['config'].baseURL !== config.baseURL ||
        clientRef.current['config'].apiKey !== config.apiKey
    ) {
        clientRef.current = new WAGatewayClient(configRef.current);
    }

    return clientRef.current;
}

// ============================================================================
// useWASession - Manage a WhatsApp session (status + QR code polling)
// ============================================================================

export interface UseWASessionOptions {
    /** Session ID to monitor (null = no session selected) */
    sessionId: string | null;
    /** Polling interval in milliseconds (default: 3000) */
    pollInterval?: number;
    /** Whether to auto-fetch QR code when status is 'qr_ready' (default: true) */
    autoFetchQR?: boolean;
    /** Callback when session becomes connected */
    onConnected?: (session: SessionStatusResponse) => void;
    /** Callback when session disconnects */
    onDisconnected?: () => void;
}

export interface UseWASessionResult {
    status: SessionStatus;
    qrCode: string | null;
    phoneNumber: string | null;
    loading: boolean;
    error: Error | null;
    /** Manually refresh the session status */
    refresh: () => void;
    /** Manually fetch a new QR code */
    fetchQR: () => Promise<void>;
}

export function useWASession(
    client: WAGatewayClient,
    options: UseWASessionOptions,
): UseWASessionResult {
    const { sessionId, pollInterval = 3000, autoFetchQR = true, onConnected, onDisconnected } = options;

    const [status, setStatus] = useState<SessionStatus>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const callbacksRef = useRef({ onConnected, onDisconnected });
    callbacksRef.current = { onConnected, onDisconnected };

    const refresh = useCallback(() => {
        setRefreshTrigger((n: number) => n + 1);
    }, []);

    const fetchQR = useCallback(async () => {
        if (!sessionId) return;
        try {
            const qr = await client.getQRCode(sessionId);
            setQrCode(qr.qrCode);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
    }, [client, sessionId]);

    useEffect(() => {
        if (!sessionId) {
            setStatus('disconnected');
            setQrCode(null);
            setPhoneNumber(null);
            setError(null);
            return;
        }

        let cancelled = false;
        let prevStatus: SessionStatus = 'disconnected';

        const poll = async () => {
            if (cancelled) return;
            setLoading(true);
            try {
                const statusRes = await client.getSessionStatus(sessionId);
                if (cancelled) return;

                setStatus(statusRes.status);
                setPhoneNumber(statusRes.phoneNumber ?? null);
                setError(null);

                // Status transition callbacks
                if (statusRes.status === 'connected' && prevStatus !== 'connected') {
                    setQrCode(null); // Clear QR when connected
                    callbacksRef.current.onConnected?.(statusRes);
                } else if (statusRes.status !== 'connected' && prevStatus === 'connected') {
                    callbacksRef.current.onDisconnected?.();
                }
                prevStatus = statusRes.status;

                // Auto-fetch QR code when ready
                if (autoFetchQR && statusRes.status === 'qr_ready') {
                    try {
                        const qr = await client.getQRCode(sessionId);
                        if (!cancelled) {
                            setQrCode(qr.qrCode);
                        }
                    } catch {
                        // QR fetch error is non-fatal, will retry on next poll
                    }
                } else if (statusRes.status !== 'qr_ready') {
                    setQrCode(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        poll();
        const interval = setInterval(poll, pollInterval);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, sessionId, pollInterval, autoFetchQR, refreshTrigger]);

    return { status, qrCode, phoneNumber, loading, error, refresh, fetchQR };
}

// ============================================================================
// useWASessions - List all sessions
// ============================================================================

export interface UseWASessionsResult {
    sessions: SessionData[];
    loading: boolean;
    error: Error | null;
    refresh: () => void;
}

export function useWASessions(client: WAGatewayClient): UseWASessionsResult {
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refresh = useCallback(() => {
        setRefreshTrigger((n: number) => n + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const data = await client.getSessions();
                if (!cancelled) {
                    setSessions(data);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [client, refreshTrigger]);

    return { sessions, loading, error, refresh };
}