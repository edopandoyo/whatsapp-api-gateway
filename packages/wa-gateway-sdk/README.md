# @masedostudio/wa-gateway-sdk

WhatsApp API Gateway SDK for integrating WhatsApp Web capabilities (multi-session, multi-tenant) into external applications such as Photobooth dashboard portals.

## Features

- **Multi-Tenant Auto-Provisioning**: Auto-register external vendors, create custom WhatsApp users, and generate secure API keys programmatically.
- **Session Management**: Programmatic creation, list, retrieval, status checking, and deletion of WhatsApp sessions.
- **QR Code Authentication**: Retrievable base64 QR code image URLs for direct rendering (`<img src={qrCode} />`).
- **Messaging API**: Send text and media (images, PDFs, documents, audio, video) via URL or base64 payload.
- **React Hooks**: Built-in hooks for listing, monitoring, and connecting WhatsApp sessions (`useWAGateway`, `useWASession`, `useWASessions`).

## Installation

Install the package directly from git or local path:

```bash
# Direct install from git repository
npm install git+https://github.com/edopandoyo/whatsapp-api-gateway.git#packages/wa-gateway-sdk

# Or relative local path in monorepos
npm install ../path/to/masedo-studio/packages/wa-gateway-sdk
```

## Quick Start

### 1. Vendor Auto-Provisioning (Backend Integration)

When a vendor first sets up WhatsApp in your app, use the **Master API Key** to auto-provision them. This creates a dedicated user and API key on the gateway.

```typescript
import { WAGatewayClient } from '@masedo/wa-gateway-sdk';

// Initialize client with master API key
const adminClient = WAGatewayClient.forIntegration(
  'https://backend-wa-api.masedo.my.id/api/v1',
  process.env.WA_GATEWAY_MASTER_KEY
);

// Register a vendor
const registration = await adminClient.registerIntegration({
  vendorId: 'vendor-uuid-1234',
  vendorName: 'Acme Photobooth Jakarta',
  source: 'photobooth',
  email: 'vendor@acme-photobooth.com' // optional
});

console.log('Vendor API Key:', registration.apiKey);
console.log('Vendor User ID:', registration.userId);

// Save registration.apiKey securely in your vendor database settings!
```

### 2. Client Operations (Vendor Settings)

Using the **Vendor's specific API key**, connect and control their WhatsApp sessions.

```typescript
import { WAGatewayClient } from '@masedo/wa-gateway-sdk';

const client = WAGatewayClient.forVendor(
  'https://backend-wa-api.masedo.my.id/api/v1',
  vendorApiKey
);

// 1. Create a WhatsApp Session
const session = await client.createSession({
  name: 'My Photobooth Session',
  vendorId: 'vendor-uuid-1234',
  integrationSource: 'photobooth'
});
console.log('Session ID:', session.id);

// 2. Poll QR Code & Status until connected
const status = await client.getSessionStatus(session.id);
if (status.status === 'qr_ready') {
  const qr = await client.getQRCode(session.id);
  // qr.qrCode is a base64 image data URL!
  // E.g. "data:image/png;base64,iVBORw0KGgoAAA..."
  console.log('Display this image to user:', qr.qrCode);
}
```

### 3. Sending Messages (After Connected)

```typescript
// Send text message
await client.sendText({
  sessionId: 'session-id-here',
  to: '628123456789',
  message: 'Halo! Ini hasil sesi photobooth Anda.'
});

// Send media (image/document/video/audio) via URL
await client.sendMedia({
  sessionId: 'session-id-here',
  to: '628123456789',
  mediaType: 'image',
  mediaUrl: 'https://example.com/photos/session-1.jpg',
  caption: 'Terima kasih telah berkunjung! 📸'
});

// Send media via base64 encoded content
await client.sendMedia({
  sessionId: 'session-id-here',
  to: '628123456789',
  mediaType: 'image',
  mediaBase64: 'iVBORw0KGgoAAAANSUhEUgAAADIA...',
  mimeType: 'image/png',
  caption: 'Terima kasih!'
});
```

---

## React Hooks Usage (Frontend Integration)

We provide React hooks out of the box. Ensure `react` is installed in your frontend project.

```tsx
import React from 'react';
import { useWAGateway, useWASession } from '@masedostudio/wa-gateway-sdk/dist/hooks';

export default function WhatsAppConnection({ vendorApiKey, sessionId }) {
  const client = useWAGateway({
    baseURL: 'https://backend-wa-api.masedo.my.id/api/v1',
    apiKey: vendorApiKey,
  });

  const { status, qrCode, phoneNumber, loading, error } = useWASession(client, {
    sessionId: sessionId,
    pollInterval: 3000, // check status every 3 seconds
    autoFetchQR: true,
  });

  return (
    <div className="card">
      <h3>WhatsApp Status: {status}</h3>
      {phoneNumber && <p>Connected to: {phoneNumber}</p>}
      
      {status === 'qr_ready' && qrCode && (
        <div className="qr-container">
          <img src={qrCode} alt="Scan QR Code" />
          <p>Scan this QR code with your WhatsApp app.</p>
        </div>
      )}
      
      {loading && <p>Loading...</p>}
      {error && <p className="error">Error: {error.message}</p>}
    </div>
  );
}
```

---

## Error Handling

The SDK exposes specific error classes inheriting from `WAGatewayError` to help debug issues properly.

```typescript
import { 
  WAGatewayError, 
  AuthenticationError, 
  SessionNotConnectedError, 
  QRNotAvailableError 
} from '@masedostudio/wa-gateway-sdk';

try {
  await client.sendText({ sessionId, to, message });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API Key.');
  } else if (error instanceof SessionNotConnectedError) {
    console.error('Session disconnected. Guide user to scan QR again.');
  } else if (error instanceof QRNotAvailableError) {
    console.error('QR code is not ready yet.');
  } else {
    console.error('General SDK error:', error.message);
  }
}
```
