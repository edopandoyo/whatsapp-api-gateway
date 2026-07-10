/**
 * @masedo/wa-gateway-sdk - Type Definitions
 */

// ============================================================================
// Configuration
// ============================================================================

export interface WAGatewayConfig {
    /** Base URL of the WA API Gateway (without trailing slash). e.g. 'https://backend-wa-api.masedo.my.id/api' */
    baseURL: string;
    /** API key for authentication */
    apiKey: string;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Optional custom headers */
    headers?: Record<string, string>;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'qr_ready'
    | 'qr_expired'
    | 'error';

export interface SessionData {
    id: string;
    name: string;
    status: SessionStatus;
    phoneNumber?: string;
    userId?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface CreateSessionOptions {
    name: string;
    /** Optional vendor ID for multi-tenant integrations */
    vendorId?: string;
    /** Optional integration source identifier */
    integrationSource?: string;
}

export interface SessionStatusResponse {
    sessionId: string;
    status: SessionStatus;
    phoneNumber?: string;
    connectedAt?: string;
}

// ============================================================================
// QR Code Types
// ============================================================================

export interface QRCodeData {
    sessionId: string;
    /** QR code as base64 data URL (can be used directly in <img src="...">) */
    qrCode: string;
    /** QR code expiration timestamp (ISO string) */
    expiresAt?: string;
    /** Whether the QR code has expired */
    expired?: boolean;
}

// ============================================================================
// Message Types
// ============================================================================

export type MediaType = 'image' | 'document' | 'audio' | 'video';

export interface SendTextOptions {
    /** Session ID to use for sending */
    sessionId: string;
    /** Recipient phone number (international format without +, e.g. '628123456789') */
    to: string;
    /** Text message content */
    message: string;
}

export interface SendMediaOptions {
    /** Session ID to use for sending */
    sessionId: string;
    /** Recipient phone number (international format without +, e.g. '628123456789') */
    to: string;
    /** Media type */
    mediaType: MediaType;
    /** Public URL to the media file (required if mediaBase64 is not provided) */
    mediaUrl?: string;
    /** Base64-encoded media content (required if mediaUrl is not provided) */
    mediaBase64?: string;
    /** Caption for the media (optional) */
    caption?: string;
    /** Filename for documents (optional, required for document type) */
    filename?: string;
    /** MIME type of the media (optional, auto-detected if not provided) */
    mimeType?: string;
}

export interface SendMessageResponse {
    success: boolean;
    messageId: string;
    status: string;
    /** Optional error message if sending failed */
    error?: string;
}

// ============================================================================
// Integration / Auto-Provisioning Types
// ============================================================================

export interface IntegrationRegisterOptions {
    /** Unique vendor ID from the integrating project (e.g. photobooth vendor UUID) */
    vendorId: string;
    /** Display name for the vendor */
    vendorName: string;
    /** Integration source identifier (e.g. 'photobooth') */
    source: string;
    /** Optional email for the auto-created user */
    email?: string;
}

export interface IntegrationRegisterResponse {
    success: boolean;
    apiKey: string;
    userId: string;
    /** Whether this is a new registration or existing */
    isNew: boolean;
}

// ============================================================================
// Generic API Response
// ============================================================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
}

export interface HealthCheckResponse {
    status: 'ok' | 'error';
    timestamp: string;
    uptime?: number;
    version?: string;
}

// ============================================================================
// Error Codes
// ============================================================================

export enum WAGatewayErrorCode {
    AUTH_FAILED = 'AUTH_FAILED',
    SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
    SESSION_NOT_CONNECTED = 'SESSION_NOT_CONNECTED',
    QR_NOT_AVAILABLE = 'QR_NOT_AVAILABLE',
    QR_EXPIRED = 'QR_EXPIRED',
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
    MEDIA_REQUIRED = 'MEDIA_REQUIRED',
    SERVER_ERROR = 'SERVER_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT = 'TIMEOUT',
    UNKNOWN = 'UNKNOWN',
}