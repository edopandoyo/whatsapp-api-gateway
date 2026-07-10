/**
 * @masedo/wa-gateway-sdk - Main Client Class
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import {
    WAGatewayConfig,
    SessionData,
    CreateSessionOptions,
    SessionStatusResponse,
    QRCodeData,
    SendTextOptions,
    SendMediaOptions,
    SendMessageResponse,
    IntegrationRegisterOptions,
    IntegrationRegisterResponse,
    HealthCheckResponse,
    ApiResponse,
} from './types';
import {
    WAGatewayError,
    NetworkError,
    TimeoutError,
    mapHttpError,
} from './errors';

export class WAGatewayClient {
    private readonly httpClient: AxiosInstance;
    private readonly config: WAGatewayConfig;

    constructor(config: WAGatewayConfig) {
        if (!config.baseURL) {
            throw new WAGatewayError('baseURL is required', 'CONFIG_ERROR' as never);
        }
        if (!config.apiKey) {
            throw new WAGatewayError('apiKey is required', 'CONFIG_ERROR' as never);
        }

        this.config = config;
        this.httpClient = axios.create({
            baseURL: config.baseURL.replace(/\/+$/, ''), // Remove trailing slashes
            timeout: config.timeout ?? 30000,
            headers: {
                'x-api-key': config.apiKey,
                'Content-Type': 'application/json',
                ...config.headers,
            },
        });
    }

    // ==========================================================================
    // Session Management
    // ==========================================================================

    /**
     * Create a new WhatsApp session
     * @param options - Session creation options
     * @returns Created session data
     */
    async createSession(options: CreateSessionOptions): Promise<SessionData> {
        const res = await this.request<SessionData>('POST', '/sessions', {
            name: options.name,
            vendorId: options.vendorId,
            integrationSource: options.integrationSource,
        });
        return res.data!;
    }

    /**
     * Get all sessions for the authenticated API key owner
     * @returns Array of sessions
     */
    async getSessions(): Promise<SessionData[]> {
        const res = await this.request<SessionData[]>('GET', '/sessions');
        return res.data ?? [];
    }

    /**
     * Get a specific session by ID
     * @param sessionId - Session ID
     * @returns Session data
     */
    async getSession(sessionId: string): Promise<SessionData> {
        const res = await this.request<SessionData>('GET', `/sessions/${sessionId}`);
        return res.data!;
    }

    /**
     * Delete/disconnect a session
     * @param sessionId - Session ID
     */
    async deleteSession(sessionId: string): Promise<void> {
        await this.request<void>('DELETE', `/sessions/${sessionId}`);
    }

    /**
     * Get the connection status of a session (lightweight polling endpoint)
     * @param sessionId - Session ID
     * @returns Session status response
     */
    async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
        const res = await this.request<SessionStatusResponse>(
            'GET',
            `/sessions/${sessionId}/status`,
        );
        return res.data!;
    }

    // ==========================================================================
    // QR Code
    // ==========================================================================

    /**
     * Get the QR code for a session (for WhatsApp authentication)
     * @param sessionId - Session ID
     * @returns QR code data (base64 data URL)
     */
    async getQRCode(sessionId: string): Promise<QRCodeData> {
        const res = await this.request<QRCodeData>('GET', `/sessions/${sessionId}/qr`);
        return res.data!;
    }

    // ==========================================================================
    // Messaging
    // ==========================================================================

    /**
     * Send a text message via WhatsApp
     * @param options - Send text options
     * @returns Send message response with message ID
     */
    async sendText(options: SendTextOptions): Promise<SendMessageResponse> {
        this.validatePhoneNumber(options.to);
        const res = await this.request<SendMessageResponse>('POST', '/messages/send-text', {
            sessionId: options.sessionId,
            to: options.to,
            message: options.message,
        });
        return res.data!;
    }

    /**
     * Send a media message (image, document, audio, video) via WhatsApp
     * @param options - Send media options
     * @returns Send message response with message ID
     */
    async sendMedia(options: SendMediaOptions): Promise<SendMessageResponse> {
        this.validatePhoneNumber(options.to);

        if (!options.mediaUrl && !options.mediaBase64) {
            throw new WAGatewayError(
                'Either mediaUrl or mediaBase64 must be provided',
                'MEDIA_REQUIRED' as never,
            );
        }

        if (options.mediaType === 'document' && !options.filename) {
            throw new WAGatewayError(
                'filename is required when sending documents',
                'MEDIA_REQUIRED' as never,
            );
        }

        const res = await this.request<SendMessageResponse>('POST', '/messages/send-media', {
            sessionId: options.sessionId,
            to: options.to,
            mediaType: options.mediaType,
            mediaUrl: options.mediaUrl,
            mediaBase64: options.mediaBase64,
            caption: options.caption,
            filename: options.filename,
            mimeType: options.mimeType,
        });
        return res.data!;
    }

    // ==========================================================================
    // Integration / Auto-Provisioning
    // ==========================================================================

    /**
     * Register a vendor for auto-provisioning (creates a WA Gateway user + API key automatically)
     * Note: This endpoint uses the master/integration API key, not a per-vendor key.
     * @param options - Integration registration options
     * @returns Integration response with API key for the vendor
     */
    async registerIntegration(
        options: IntegrationRegisterOptions,
    ): Promise<IntegrationRegisterResponse> {
        const res = await this.request<IntegrationRegisterResponse>(
            'POST',
            '/integration/register',
            {
                vendorId: options.vendorId,
                vendorName: options.vendorName,
                source: options.source,
                email: options.email,
            },
        );
        return res.data!;
    }

    // ==========================================================================
    // Health Check
    // ==========================================================================

    /**
     * Check if the WA Gateway server is healthy
     * @returns Health check response
     */
    async healthCheck(): Promise<HealthCheckResponse> {
        const res = await this.request<HealthCheckResponse>('GET', '/health');
        return res.data!;
    }

    // ==========================================================================
    // Private Helpers
    // ==========================================================================

    /**
     * Make an HTTP request to the WA Gateway API
     */
    private async request<T>(
        method: string,
        endpoint: string,
        body?: unknown,
    ): Promise<ApiResponse<T>> {
        try {
            const response: AxiosResponse<ApiResponse<T>> = await this.httpClient.request({
                method,
                url: endpoint,
                data: body,
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * Handle and transform errors
     */
    private handleError(error: unknown): WAGatewayError {
        // Axios error
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<ApiResponse>;

            // Network error (no response received)
            if (!axiosError.response) {
                if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
                    return new TimeoutError(
                        `Request timed out after ${this.config.timeout ?? 30000}ms`,
                    );
                }
                return new NetworkError(axiosError.message);
            }

            // HTTP error response
            const statusCode = axiosError.response.status;
            const message =
                axiosError.response.data?.message ||
                axiosError.response.data?.data ||
                `Request failed with status ${statusCode}`;
            return mapHttpError(statusCode, String(message), axiosError.response.data);
        }

        // Already a WAGatewayError
        if (error instanceof WAGatewayError) {
            return error;
        }

        // Unknown error
        return new WAGatewayError(
            error instanceof Error ? error.message : 'An unknown error occurred',
        );
    }

    /**
     * Validate phone number format
     */
    private validatePhoneNumber(phone: string): void {
        // Remove common separators for validation
        const cleaned = phone.replace(/[\s\-+()]/g, '');
        if (!/^\d{8,15}$/.test(cleaned)) {
            throw new WAGatewayError(
                `Invalid phone number: ${phone}. Expected international format without + (e.g. '628123456789')`,
                'INVALID_PHONE_NUMBER' as never,
            );
        }
    }

    // ==========================================================================
    // Static Factory Methods
    // ==========================================================================

    /**
     * Create a client configured for a specific vendor (using vendor's API key)
     * @param baseURL - WA Gateway base URL
     * @param apiKey - Vendor's API key
     * @param options - Additional options
     */
    static forVendor(
        baseURL: string,
        apiKey: string,
        options?: Partial<WAGatewayConfig>,
    ): WAGatewayClient {
        return new WAGatewayClient({ baseURL, apiKey, ...options });
    }

    /**
     * Create a client configured for integration/master operations
     * @param baseURL - WA Gateway base URL
     * @param masterApiKey - Master/integration API key
     * @param options - Additional options
     */
    static forIntegration(
        baseURL: string,
        masterApiKey: string,
        options?: Partial<WAGatewayConfig>,
    ): WAGatewayClient {
        return new WAGatewayClient({ baseURL, apiKey: masterApiKey, ...options });
    }
}