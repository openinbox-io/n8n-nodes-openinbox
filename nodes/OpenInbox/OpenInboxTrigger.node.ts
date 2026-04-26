import {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
  NodeOperationError,
} from 'n8n-workflow';

import { createHmac, timingSafeEqual } from 'crypto';

import { openInboxApiRequest } from './GenericFunctions';

import {
  OPENINBOX_EVENT_EMAIL_RECEIVED,
  OPENINBOX_EVENT_INBOX_CREATED,
  OPENINBOX_EVENT_INBOX_EXPIRED,
  OPENINBOX_SUPPORTED_EVENTS,
  OPENINBOX_WEBHOOK_DELIVERY_HEADER,
  OPENINBOX_WEBHOOK_EVENT_HEADER,
  OPENINBOX_WEBHOOK_SIGNATURE_HEADER,
} from './constants';

/**
 * OpenInbox Trigger node.
 *
 * Registers a webhook with the OpenInbox backend (`POST /api/v1/webhooks`)
 * when the n8n workflow is activated, and deletes it
 * (`DELETE /api/v1/webhooks/:webhookId`) when the workflow is deactivated.
 *
 * The webhook fires for one or more of the events documented in
 * `backend/src/entities/webhook.entity.ts`:
 *   - email.received
 *   - inbox.created
 *   - inbox.expired
 *
 * The full request body delivered by OpenInbox is forwarded as the trigger
 * output. Signature verification headers (`X-Webhook-Signature`,
 * `X-Webhook-Event`, `X-Webhook-Delivery`) are also surfaced for downstream
 * verification logic.
 */
export class OpenInboxTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OpenInbox Trigger',
    name: 'openInboxTrigger',
    icon: 'file:openinbox.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["events"].join(", ")}}',
    description:
      'Starts the workflow when an OpenInbox event fires (e.g. when a new email is received).',
    defaults: {
      name: 'OpenInbox Trigger',
    },
    inputs: [],
    outputs: ['main'],
    credentials: [
      {
        name: 'openInboxApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: [OPENINBOX_EVENT_EMAIL_RECEIVED],
        options: [
          {
            name: 'Email Received',
            value: OPENINBOX_EVENT_EMAIL_RECEIVED,
            description:
              'Triggered whenever a new email is received in any of your inboxes',
          },
          {
            name: 'Inbox Created',
            value: OPENINBOX_EVENT_INBOX_CREATED,
            description:
              'Triggered when a new inbox is created on your account',
          },
          {
            name: 'Inbox Expired',
            value: OPENINBOX_EVENT_INBOX_EXPIRED,
            description: 'Triggered when an inbox reaches its expiration time',
          },
        ],
        description: 'OpenInbox events that should activate this trigger',
      },
      {
        displayName: 'Reject Invalid Signatures',
        name: 'rejectInvalidSignatures',
        type: 'boolean',
        default: true,
        description:
          'Whether to drop deliveries whose HMAC signature does not match the stored webhook secret. When disabled, items still flow through but `__delivery.verified` will be false on tampered payloads.',
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const webhookUrl = this.getNodeWebhookUrl('default');
        const events = this.getNodeParameter('events', []) as string[];

        if (webhookData.webhookId) {
          // Confirm the previously-registered webhook still exists on the
          // OpenInbox side; if not, force a re-creation.
          try {
            const response = await openInboxApiRequest.call(
              this,
              'GET',
              '/webhooks',
            );
            const list = (response?.data ?? []) as IDataObject[];
            const found = list.find((wh) => wh.id === webhookData.webhookId);
            if (!found) {
              delete webhookData.webhookId;
              delete webhookData.webhookSecret;
              return false;
            }
            // Detect drift in target URL or events to force re-create.
            if (found.url !== webhookUrl) {
              return false;
            }
            const remoteEvents = (found.events as string[] | undefined) ?? [];
            const hasAllEvents = events.every((e) => remoteEvents.includes(e));
            const sameLength = remoteEvents.length === events.length;
            return hasAllEvents && sameLength;
          } catch {
            return false;
          }
        }

        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const events = this.getNodeParameter('events', []) as string[];

        if (!webhookUrl) {
          return false;
        }

        const validEvents = events.filter((e) =>
          (OPENINBOX_SUPPORTED_EVENTS as readonly string[]).includes(e),
        );
        if (validEvents.length === 0) {
          return false;
        }

        const body: IDataObject = {
          url: webhookUrl,
          events: validEvents,
        };

        const response = await openInboxApiRequest.call(
          this,
          'POST',
          '/webhooks',
          body,
        );
        const data = (response?.data ?? response) as IDataObject;

        if (!data || !data.id) {
          return false;
        }

        const webhookData = this.getWorkflowStaticData('node');
        webhookData.webhookId = data.id as string;
        if (data.secret) {
          webhookData.webhookSecret = data.secret as string;
        }
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.webhookId) {
          return true;
        }

        try {
          await openInboxApiRequest.call(
            this,
            'DELETE',
            `/webhooks/${encodeURIComponent(webhookData.webhookId as string)}`,
          );
        } catch {
          // Even if the remote delete fails (e.g. already gone), clear local
          // state so n8n does not get stuck trying to delete a phantom hook.
        }

        delete webhookData.webhookId;
        delete webhookData.webhookSecret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const headers = this.getHeaderData() as IDataObject;
    const body = (req.body ?? {}) as IDataObject;

    const signatureHeader = headers[
      OPENINBOX_WEBHOOK_SIGNATURE_HEADER.toLowerCase()
    ] as string | undefined;
    const eventHeader = headers[
      OPENINBOX_WEBHOOK_EVENT_HEADER.toLowerCase()
    ] as string | undefined;
    const deliveryIdHeader = headers[
      OPENINBOX_WEBHOOK_DELIVERY_HEADER.toLowerCase()
    ] as string | undefined;

    // Verify the HMAC signature against the raw request body. We MUST use
    // the exact bytes OpenInbox signed — re-stringifying `req.body` is
    // unreliable because key order, whitespace, and numeric coercion can
    // diverge between the original JSON and Node's reserialised form.
    const webhookData = this.getWorkflowStaticData('node');
    const secret = webhookData.webhookSecret as string | undefined;
    const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;

    let verified = false;
    let verifyError: string | undefined;

    if (!signatureHeader) {
      verifyError = 'missing signature header';
    } else if (!secret) {
      verifyError = 'webhook secret unavailable on this workflow';
    } else if (!rawBody) {
      verifyError = 'raw request body unavailable';
    } else {
      const parts = Object.fromEntries(
        signatureHeader.split(',').map((p) => {
          const idx = p.indexOf('=');
          return idx === -1 ? [p, ''] : [p.slice(0, idx), p.slice(idx + 1)];
        }),
      ) as Record<string, string>;
      const t = parts.t;
      const v1 = parts.v1;
      if (!t || !v1) {
        verifyError = `malformed signature header: ${signatureHeader}`;
      } else {
        const rawBodyStr = Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : String(rawBody);
        const expected = createHmac('sha256', secret)
          .update(`${t}.${rawBodyStr}`)
          .digest('hex');
        try {
          const a = Buffer.from(expected, 'hex');
          const b = Buffer.from(v1, 'hex');
          verified = a.length === b.length && timingSafeEqual(a, b);
          if (!verified) {
            verifyError = 'signature mismatch';
          }
        } catch {
          verifyError = 'signature decode error';
        }
      }
    }

    const rejectInvalid = this.getNodeParameter(
      'rejectInvalidSignatures',
      true,
    ) as boolean;

    if (!verified && rejectInvalid) {
      // Surface the failure in the n8n execution log without leaking the
      // received signature back to the caller.
      throw new NodeOperationError(
        this.getNode(),
        `OpenInbox webhook signature verification failed: ${verifyError ?? 'unknown'}`,
      );
    }

    const delivery = {
      signature: signatureHeader,
      event: eventHeader,
      deliveryId: deliveryIdHeader,
      verified,
      verifyError,
    };

    return {
      workflowData: [
        this.helpers.returnJsonArray([
          {
            ...body,
            __delivery: delivery,
          },
        ]),
      ],
    };
  }
}
