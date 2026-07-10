/**
 * @masedo/wa-gateway-sdk
 * WhatsApp API Gateway SDK
 *
 * Manage WhatsApp sessions, scan QR codes, and send messages/media
 * via the Masedo WA API Gateway.
 *
 * @example
 * ```typescript
 * import { WAGatewayClient } from '@masedo/wa-gateway-sdk';
 *
 * const client = new WAGatewayClient({
 *   baseURL: 'https://backend-wa-api.masedo.my.id/api',
 *   apiKey: 'your-api-key',
 * });
 *
 * // Create a session and get QR code
 * const session = await client.createSession({ name: 'My Session' });
 * const qr = await client.getQRCode(session.id);
 * console.log(qr.qrCode); // base64 data URL
 *
 * // Send a text message
 * await client.sendText({
 *   sessionId: session.id,
 *   to: '628123456789',
 *   message: 'Hello from SDK!',
 * });
 *
 * // Send a media message
 * await client.sendMedia({
 *   sessionId: session.id,
 *   to: '628123456789',
 *   mediaType: 'image',
 *   mediaUrl: 'https://example.com/photo.jpg',
 *   caption: 'Photo from photobooth!',
 * });
 * ```
 */

// Main client
export { WAGatewayClient } from './client';

// Types
export type {
    WAGatewayConfig,
    SessionData,
    SessionStatus,
    CreateSessionOptions,
    SessionStatusResponse,
    QRCodeData,
    SendTextOptions,
    SendMediaOptions,
    SendMessageResponse,
    MediaType,
    IntegrationRegisterOptions,
    IntegrationRegisterResponse,
    ApiResponse,
    HealthCheckResponse,
} from './types';

// Error classes
export {
    WAGatewayError,
    AuthenticationError,
    SessionNotFoundError,
    SessionNotConnectedError,
    QRNotAvailableError,
    QRExpiredError,
    RateLimitedError,
    NetworkError,
    TimeoutError,
    mapHttpError,
} from './errors';

// Error codes enum
export { WAGatewayErrorCode } from './types';