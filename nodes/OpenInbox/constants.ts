/**
 * Shared constants for the OpenInbox n8n nodes.
 *
 * Keep all hardcoded strings here so the node files stay free of magic values.
 */

export const OPENINBOX_DEFAULT_BASE_URL = 'https://api.openinbox.io';
export const OPENINBOX_API_PREFIX = '/api/v1';

export const OPENINBOX_API_KEY_HEADER = 'X-API-Key';

export const OPENINBOX_WEBHOOK_SIGNATURE_HEADER = 'X-Webhook-Signature';
export const OPENINBOX_WEBHOOK_EVENT_HEADER = 'X-Webhook-Event';
export const OPENINBOX_WEBHOOK_DELIVERY_HEADER = 'X-Webhook-Delivery';

export const OPENINBOX_EVENT_EMAIL_RECEIVED = 'email.received';
export const OPENINBOX_EVENT_INBOX_CREATED = 'inbox.created';
export const OPENINBOX_EVENT_INBOX_EXPIRED = 'inbox.expired';

export const OPENINBOX_SUPPORTED_EVENTS = [
  OPENINBOX_EVENT_EMAIL_RECEIVED,
  OPENINBOX_EVENT_INBOX_CREATED,
  OPENINBOX_EVENT_INBOX_EXPIRED,
] as const;

export const CREDENTIALS_NAME = 'openInboxApi';
