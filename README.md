# n8n-nodes-openinbox

[![npm version](https://img.shields.io/npm/v/n8n-nodes-openinbox.svg)](https://www.npmjs.com/package/n8n-nodes-openinbox)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-openinbox.svg)](https://www.npmjs.com/package/n8n-nodes-openinbox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE.md)

This is an [n8n community node](https://docs.n8n.io/integrations/community-nodes/) for [OpenInbox](https://openinbox.io) — a disposable / temporary email API. Use it to programmatically create inboxes, read incoming emails, and trigger workflows the moment an email lands.

> OpenInbox is **receive-only** disposable email infrastructure. You can create inboxes on demand, list received messages, and subscribe to webhook events such as `email.received`.

## Example workflow

The repo ships with a complete demo workflow that:

1. Listens for OpenInbox webhook deliveries (`email.received`, `inbox.created`, `inbox.expired`).
2. Verifies the `X-Webhook-Signature` HMAC.
3. Routes by event with a Switch node.
4. On `email.received`, pulls the full email body and extracts a 6-digit OTP.

![OpenInbox n8n example workflow](https://raw.githubusercontent.com/openinbox-io/n8n-nodes-openinbox/main/docs/screenshots/n8n-workflow-example.png)

Import [`examples/openinbox-full-demo.workflow.json`](./examples/openinbox-full-demo.workflow.json) into n8n to try it.

## Installation

1. In n8n, go to **Settings → Community Nodes**.
2. Click **Install**.
3. Enter `n8n-nodes-openinbox` and confirm.

After installation, two nodes become available:

- **OpenInbox** — REST operations against the OpenInbox API.
- **OpenInbox Trigger** — Fires when an OpenInbox webhook event is delivered.

## Credentials

Create an **OpenInbox API** credential and set:

- **API Key** — generate one from your OpenInbox dashboard at https://openinbox.io. Pro / Business / 7-Day Pass tiers are required for API access.
- **Base URL** — defaults to `https://api.openinbox.io`. Only override if you self-host. The `/api/v1` path is appended automatically.

The key is sent as the `X-API-Key` request header.

## Operations

### Inbox

| Operation | HTTP     | Endpoint                   | Description                                                                            |
| --------- | -------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Create    | `POST`   | `/api/v1/inboxes`          | Create a new disposable inbox. Optional `prefix` to control the local-part.            |
| Get       | `GET`    | `/api/v1/inboxes/:inboxId` | Fetch an inbox by ID, including `emailCount` and `isExpired`.                          |
| Get Many  | `GET`    | `/api/v1/inboxes`          | List inboxes with `limit`/`offset` pagination. Toggle **Return All** to auto-paginate. |
| Delete    | `DELETE` | `/api/v1/inboxes/:inboxId` | Permanently delete an inbox and all its emails.                                        |

### Email

| Operation | HTTP     | Endpoint                          | Description                                            |
| --------- | -------- | --------------------------------- | ------------------------------------------------------ |
| Get Many  | `GET`    | `/api/v1/inboxes/:inboxId/emails` | List emails in an inbox. Optional `unreadOnly` filter. |
| Get       | `GET`    | `/api/v1/emails/:emailId`         | Fetch a single email (auto-marks as read).             |
| Delete    | `DELETE` | `/api/v1/emails/:emailId`         | Permanently delete an email.                           |

### Webhook

| Operation | HTTP     | Endpoint                      | Description                                |
| --------- | -------- | ----------------------------- | ------------------------------------------ |
| Create    | `POST`   | `/api/v1/webhooks`            | Register a webhook for one or more events. |
| Get Many  | `GET`    | `/api/v1/webhooks`            | List all webhooks on the account.          |
| Delete    | `DELETE` | `/api/v1/webhooks/:webhookId` | Remove a webhook subscription.             |

### Account

| Operation | HTTP  | Endpoint          | Description                              |
| --------- | ----- | ----------------- | ---------------------------------------- |
| Get       | `GET` | `/api/v1/account` | Get tier, rate limits and current usage. |

## Trigger node

The **OpenInbox Trigger** automatically registers a webhook with OpenInbox when the workflow activates and removes it when the workflow deactivates.

### Setup

1. Add an **OpenInbox Trigger** node to your workflow.
2. Select the **OpenInbox API** credential.
3. Choose one or more events:
   - `email.received` — fires for every email delivered to any of your inboxes.
   - `inbox.created`
   - `inbox.expired`
4. **Activate** the workflow. n8n will call `POST /api/v1/webhooks` with the workflow’s public webhook URL. Deactivating calls `DELETE /api/v1/webhooks/:id`.

### Payload

OpenInbox delivers JSON like this:

```json
{
  "event": "email.received",
  "timestamp": "2026-04-26T12:00:00Z",
  "data": {
    "emailId": "uuid",
    "inboxId": "uuid",
    "from": "sender@example.com",
    "subject": "Hello!"
  }
}
```

The trigger forwards this body verbatim, plus a `__delivery` object containing the `X-Webhook-Signature`, `X-Webhook-Event`, and `X-Webhook-Delivery` headers so you can verify the HMAC-SHA256 signature against your webhook secret.

### Signature format

```
X-Webhook-Signature: t=<timestamp>,v1=<hex_sha256>
```

To verify: `HMAC_SHA256(secret, "<timestamp>." + JSON.stringify(payload))`.

## Compatibility

- n8n `>= 1.0`
- Node.js `>= 18.10`

## Resources

- [OpenInbox website](https://openinbox.io)
- [API documentation](https://openinbox.io/api-docs)
- [Issue tracker](https://github.com/openinbox-io/n8n-nodes-openinbox/issues)
- [n8n community nodes docs](https://docs.n8n.io/integrations/community-nodes/)

## License

MIT — see [LICENSE.md](./LICENSE.md).
