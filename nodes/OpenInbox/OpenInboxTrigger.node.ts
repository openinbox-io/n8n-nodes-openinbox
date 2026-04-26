import {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow';

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

    // Surface the OpenInbox-specific delivery headers in the output so
    // downstream nodes can verify the HMAC signature against the secret.
    const delivery = {
      signature: headers[OPENINBOX_WEBHOOK_SIGNATURE_HEADER.toLowerCase()],
      event: headers[OPENINBOX_WEBHOOK_EVENT_HEADER.toLowerCase()],
      deliveryId: headers[OPENINBOX_WEBHOOK_DELIVERY_HEADER.toLowerCase()],
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
