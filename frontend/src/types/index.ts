// Tipe-tipe data yang digunakan di seluruh aplikasi

export type SessionStatus =
  | 'pending'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'auth_failure';

export interface Session {
  id: string;
  user_id: string;
  session_name: string;
  status: SessionStatus;
  webhook_url: string | null;
  last_connected_at: string | null;
  created_at: string;
  phone_number: string | null;
  updated_at: string | null;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'media' | 'bulk';
export type MessageStatus = 'sent' | 'failed' | 'received';
export type WebhookStatus = 'pending' | 'delivered' | 'failed' | null;

export interface MessageLog {
  id: string;
  session_id: string;
  direction: MessageDirection;
  from_number: string;
  to_number: string;
  message_type: MessageType;
  content_preview: string | null;
  status: MessageStatus;
  webhook_status: WebhookStatus;
  created_at: string;
}

export interface ApiKey {
  id: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  api_key?: string;   // hanya tersedia saat pertama kali dibuat
}
