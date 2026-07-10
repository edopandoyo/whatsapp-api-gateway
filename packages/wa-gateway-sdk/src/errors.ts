/**
 * @masedo/wa-gateway-sdk - Custom Error Classes
 */

import { WAGatewayErrorCode } from './types';

export class WAGatewayError extends Error {
    public readonly code: WAGatewayErrorCode;
    public readonly statusCode?: number;
    public readonly details?: unknown;

    constructor(
        message: string,
        code: WAGatewayErrorCode = WAGatewayErrorCode.UNKNOWN,
        statusCode?: number,
        details?: unknown,
    ) {
        super(message);
        this.name = 'WAGatewayError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;

        // Maintain proper stack trace (V8 engines only)
        if ((Error as any).captureStackTrace) {
            (Error as any).captureStackTrace(this, WAGatewayError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            details: this.details,
        };
    }
}

export class AuthenticationError extends WAGatewayError {
    constructor(message: string = 'Authentication failed. Check your API key.', details?: unknown) {
        super(message, WAGatewayErrorCode.AUTH_FAILED, 401, details);
        this.name = 'AuthenticationError';
    }
}

export class SessionNotFoundError extends WAGatewayError {
    constructor(sessionId: string, details?: unknown) {
        super(`Session not found: ${sessionId}`, WAGatewayErrorCode.SESSION_NOT_FOUND, 404, details);
        this.name = 'SessionNotFoundError';
    }
}

export class SessionNotConnectedError extends WAGatewayError {
    constructor(sessionId: string, details?: unknown) {
        super(
            `WhatsApp session is not connected: ${sessionId}. Please scan QR code first.`,
            WAGatewayErrorCode.SESSION_NOT_CONNECTED,
            400,
            details,
        );
        this.name = 'SessionNotConnectedError';
    }
}

export class QRNotAvailableError extends WAGatewayError {
    constructor(sessionId: string, details?: unknown) {
        super(
            `QR code not available for session: ${sessionId}. Session may already be connected.`,
            WAGatewayErrorCode.QR_NOT_AVAILABLE,
            400,
            details,
        );
        this.name = 'QRNotAvailableError';
    }
}

export class QRExpiredError extends WAGatewayError {
    constructor(sessionId: string, details?: unknown) {
        super(
            `QR code has expired for session: ${sessionId}. Please request a new QR code.`,
            WAGatewayErrorCode.QR_EXPIRED,
            410,
            details,
        );
        this.name = 'QRExpiredError';
    }
}

export class RateLimitedError extends WAGatewayError {
    constructor(message: string = 'Rate limit exceeded. Please try again later.', details?: unknown) {
        super(message, WAGatewayErrorCode.RATE_LIMITED, 429, details);
        this.name = 'RateLimitedError';
    }
}

export class NetworkError extends WAGatewayError {
    constructor(message: string = 'Network error. Unable to reach WA Gateway server.', details?: unknown) {
        super(message, WAGatewayErrorCode.NETWORK_ERROR, undefined, details);
        this.name = 'NetworkError';
    }
}

export class TimeoutError extends WAGatewayError {
    constructor(message: string = 'Request timed out.', details?: unknown) {
        super(message, WAGatewayErrorCode.TIMEOUT, undefined, details);
        this.name = 'TimeoutError';
    }
}

/**
 * Map an HTTP error response to the appropriate WAGatewayError subclass
 */
export function mapHttpError(statusCode: number, message: string, details?: unknown): WAGatewayError {
    switch (statusCode) {
        case 401:
        case 403:
            return new AuthenticationError(message, details);
        case 404:
            return new WAGatewayError(message, WAGatewayErrorCode.SESSION_NOT_FOUND, statusCode, details);
        case 410:
            return new QRExpiredError('', details);
        case 429:
            return new RateLimitedError(message, details);
        case 400:
            if (message.toLowerCase().includes('not connected')) {
                return new SessionNotConnectedError('', details);
            }
            if (message.toLowerCase().includes('qr') && message.toLowerCase().includes('not available')) {
                return new QRNotAvailableError('', details);
            }
            return new WAGatewayError(message, WAGatewayErrorCode.UNKNOWN, statusCode, details);
        case 500:
        case 502:
        case 503:
            return new WAGatewayError(message, WAGatewayErrorCode.SERVER_ERROR, statusCode, details);
        default:
            return new WAGatewayError(message, WAGatewayErrorCode.UNKNOWN, statusCode, details);
    }
}