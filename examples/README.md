# OpenInbox – Full Feature Demo Workflow

A single importable n8n workflow that exercises **every operation** on the OpenInbox node plus the OpenInbox Trigger, including HMAC signature verification.

## Import

1. n8n → **Workflows → Import from File** → select `openinbox-full-demo.workflow.json`.
2. Open every node with a yellow ⚠️ "credential not selected" badge and pick your **OpenInbox API** credential. (The JSON ships with a placeholder ID `REPLACE_WITH_YOUR_CRED_ID`.)
3. In **Webhook: Create**, change `https://webhook.site/REPLACE_WITH_YOUR_TEST_URL` to a real test URL (e.g. one from https://webhook.site).
4. In **Verify HMAC Signature** (Code node), set the env var `OPENINBOX_WEBHOOK_SECRET` on your n8n instance OR replace the inline default with the secret returned by `POST /api/webhooks`.

## What it demonstrates

The workflow has **three independent flows** on one canvas.

### Flow 1 — CRUD demo (Manual trigger, top row)

`Manual` → `Account.get` → `Inbox.create` → `Inbox.get` → `Inbox.getAll` → `Wait 60s` → `Email.getAll` → `Email.get` → `Email.delete` → `Inbox.delete`

While the **Wait 60s** node is sleeping, send a real email to the address printed by **Inbox: Create**. The downstream `Email.*` nodes will then have something to fetch and delete.

Covers: `account.get`, `inbox.create / get / getAll / delete`, `email.getAll / get / delete`.

### Flow 2 — Webhook CRUD demo (Manual trigger, middle row)

`Manual` → `Webhook.create` → `Webhook.getAll` → `Webhook.delete`

Covers: `webhook.create / getAll / delete`.

### Flow 3 — Trigger + signature verification (bottom row)

`OpenInbox Trigger` → `Verify HMAC Signature` (Code) → `If` → `Switch by event` → branches:

- `email.received` → `Email.get (full body)` → `Extract OTP` (regex `\b(\d{4,8})\b`)
- `inbox.created` → `Set` summary
- `inbox.expired` → `Set` summary
- invalid signature → `Reject` branch

To activate this flow, **Save** then **Activate** the workflow. n8n will give you a production webhook URL like `https://your-n8n/webhook/openinbox-trigger-demo`. The trigger node automatically registers that URL with OpenInbox via `POST /api/v1/webhooks` and stores the returned secret in the workflow's static data — no manual webhook creation needed for this flow.

> **Test mode caveat**: while you have the trigger open in "Listen for test event" mode, n8n uses a one-shot URL (`/webhook-test/...`) and **deletes the webhook from OpenInbox after the first event fires**. This is by design. For continuous testing, **Activate** the workflow.

## Signature verification

The `Verify HMAC Signature` Code node implements the same scheme as `backend/src/webhook/webhook.service.ts → signPayload()`:

```
header X-Webhook-Signature: t=<unix_ms>,v1=<hex_sha256>
signed string                = `${t}.${JSON.stringify(payload)}`
expected                     = HMAC_SHA256(secret, signed_string)
```

It uses `crypto.timingSafeEqual` to prevent timing attacks. Bad signatures are routed to the **Reject** branch.

## Files

- `openinbox-full-demo.workflow.json` — importable n8n workflow.
- `README.md` — this file.
