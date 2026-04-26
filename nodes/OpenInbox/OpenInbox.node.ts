import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  IDataObject,
} from 'n8n-workflow';

import { openInboxApiRequest } from './GenericFunctions';

import {
  OPENINBOX_DEFAULT_BASE_URL,
  OPENINBOX_SUPPORTED_EVENTS,
} from './constants';

/**
 * OpenInbox main node.
 *
 * Implements every endpoint exposed by `backend/src/api/api.controller.ts`
 * (mounted at `/api/v1`) that is callable with an API key:
 *
 *  - GET    /inboxes
 *  - POST   /inboxes
 *  - GET    /inboxes/:inboxId
 *  - DELETE /inboxes/:inboxId
 *  - GET    /inboxes/:inboxId/emails
 *  - GET    /emails/:emailId
 *  - DELETE /emails/:emailId
 *  - GET    /webhooks
 *  - POST   /webhooks
 *  - DELETE /webhooks/:webhookId
 *  - GET    /account
 */
export class OpenInbox implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OpenInbox',
    name: 'openInbox',
    icon: 'file:openinbox.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Interact with the OpenInbox disposable email API',
    defaults: {
      name: 'OpenInbox',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'openInboxApi',
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: OPENINBOX_DEFAULT_BASE_URL,
    },
    properties: [
      // =====================================================
      // Resource
      // =====================================================
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Inbox',
            value: 'inbox',
            description: 'Disposable email inbox',
          },
          {
            name: 'Email',
            value: 'email',
            description: 'A received email message',
          },
          {
            name: 'Webhook',
            value: 'webhook',
            description: 'Outbound webhook subscription',
          },
          {
            name: 'Account',
            value: 'account',
            description: 'API account information and usage',
          },
        ],
        default: 'inbox',
      },

      // =====================================================
      // Inbox operations
      // =====================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['inbox'],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            action: 'Create an inbox',
            description: 'Create a new disposable email inbox',
          },
          {
            name: 'Delete',
            value: 'delete',
            action: 'Delete an inbox',
            description: 'Permanently delete an inbox and all its emails',
          },
          {
            name: 'Get',
            value: 'get',
            action: 'Get an inbox',
            description: 'Get a specific inbox by ID',
          },
          {
            name: 'Get Many',
            value: 'getAll',
            action: 'Get many inboxes',
            description: 'List many inboxes for the API account',
          },
        ],
        default: 'create',
      },

      // =====================================================
      // Email operations
      // =====================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['email'],
          },
        },
        options: [
          {
            name: 'Delete',
            value: 'delete',
            action: 'Delete an email',
            description: 'Permanently delete an email message',
          },
          {
            name: 'Get',
            value: 'get',
            action: 'Get an email',
            description: 'Get a single email by ID (auto-marks as read)',
          },
          {
            name: 'Get Many',
            value: 'getAll',
            action: 'Get many emails for an inbox',
            description: 'List emails received in a specific inbox',
          },
        ],
        default: 'getAll',
      },

      // =====================================================
      // Webhook operations
      // =====================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['webhook'],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            action: 'Create a webhook',
            description: 'Register a new outbound webhook',
          },
          {
            name: 'Delete',
            value: 'delete',
            action: 'Delete a webhook',
            description: 'Remove a registered webhook',
          },
          {
            name: 'Get Many',
            value: 'getAll',
            action: 'Get many webhooks',
            description: 'List many webhooks for the API account',
          },
        ],
        default: 'getAll',
      },

      // =====================================================
      // Account operations
      // =====================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['account'],
          },
        },
        options: [
          {
            name: 'Get',
            value: 'get',
            action: 'Get account information',
            description: 'Get the API account info, tier and usage',
          },
        ],
        default: 'get',
      },

      // =====================================================
      // Inbox: Create
      // =====================================================
      {
        displayName: 'Custom Prefix',
        name: 'prefix',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['inbox'],
            operation: ['create'],
          },
        },
        description:
          'Optional custom prefix for the inbox local-part. Leave empty to let OpenInbox generate a random prefix.',
      },

      // =====================================================
      // Inbox: Get / Delete (inboxId)
      // =====================================================
      {
        displayName: 'Inbox ID',
        name: 'inboxId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['inbox'],
            operation: ['get', 'delete'],
          },
        },
        description: 'UUID of the OpenInbox inbox',
      },

      // =====================================================
      // Inbox: Get Many - pagination
      // =====================================================
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            resource: ['inbox'],
            operation: ['getAll'],
          },
        },
        description: 'Whether to return all results or only up to a given limit',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: {
          minValue: 1,
        },
        default: 50,
        displayOptions: {
          show: {
            resource: ['inbox'],
            operation: ['getAll'],
            returnAll: [false],
          },
        },
        description: 'Max number of results to return',
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        displayOptions: {
          show: {
            resource: ['inbox'],
            operation: ['getAll'],
            returnAll: [false],
          },
        },
        description:
          'Number of inboxes to skip before starting to return results',
      },

      // =====================================================
      // Email: Get Many for inbox
      // =====================================================
      {
        displayName: 'Inbox ID',
        name: 'inboxId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['email'],
            operation: ['getAll'],
          },
        },
        description: 'UUID of the inbox to list emails from',
      },
      {
        displayName: 'Unread Only',
        name: 'unreadOnly',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            resource: ['email'],
            operation: ['getAll'],
          },
        },
        description:
          'Whether to only return emails that have not yet been read',
      },

      // =====================================================
      // Email: Get / Delete (emailId)
      // =====================================================
      {
        displayName: 'Email ID',
        name: 'emailId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['email'],
            operation: ['get', 'delete'],
          },
        },
        description: 'UUID of the email message',
      },

      // =====================================================
      // Webhook: Create
      // =====================================================
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://example.com/webhook',
        displayOptions: {
          show: {
            resource: ['webhook'],
            operation: ['create'],
          },
        },
        description: 'HTTPS URL that OpenInbox will POST events to',
      },
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: ['email.received'],
        options: OPENINBOX_SUPPORTED_EVENTS.map((event) => ({
          name: event,
          value: event,
          description: `Subscribe to the ${event} event`,
        })),
        displayOptions: {
          show: {
            resource: ['webhook'],
            operation: ['create'],
          },
        },
        description: 'List of events the webhook should subscribe to',
      },
      {
        displayName: 'Secret',
        name: 'secret',
        type: 'string',
        typeOptions: {
          password: true,
        },
        default: '',
        displayOptions: {
          show: {
            resource: ['webhook'],
            operation: ['create'],
          },
        },
        description:
          'Optional shared secret used by OpenInbox to sign webhook payloads (HMAC-SHA256). Auto-generated by the server if omitted.',
      },

      // =====================================================
      // Webhook: Delete
      // =====================================================
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['webhook'],
            operation: ['delete'],
          },
        },
        description: 'UUID of the webhook to delete',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: IDataObject[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let response: any;

        // =========================================================
        // INBOX
        // =========================================================
        if (resource === 'inbox') {
          if (operation === 'create') {
            const prefix = this.getNodeParameter('prefix', i, '') as string;
            const body: IDataObject = {};
            if (prefix) {
              body.prefix = prefix;
            }
            response = await openInboxApiRequest.call(
              this,
              'POST',
              '/inboxes',
              body,
            );
            const data = response?.data ?? response;
            returnData.push(data as IDataObject);
            continue;
          }

          if (operation === 'get') {
            const inboxId = this.getNodeParameter('inboxId', i) as string;
            response = await openInboxApiRequest.call(
              this,
              'GET',
              `/inboxes/${encodeURIComponent(inboxId)}`,
            );
            returnData.push((response?.data ?? response) as IDataObject);
            continue;
          }

          if (operation === 'delete') {
            const inboxId = this.getNodeParameter('inboxId', i) as string;
            response = await openInboxApiRequest.call(
              this,
              'DELETE',
              `/inboxes/${encodeURIComponent(inboxId)}`,
            );
            returnData.push(response as IDataObject);
            continue;
          }

          if (operation === 'getAll') {
            const returnAll = this.getNodeParameter(
              'returnAll',
              i,
              false,
            ) as boolean;

            if (returnAll) {
              const pageSize = 100;
              let offset = 0;
              const collected: IDataObject[] = [];
              // Paginate using `limit` and `offset`. The backend returns
              // `meta.total` so we stop once we have collected everything.
              // eslint-disable-next-line no-constant-condition
              while (true) {
                response = await openInboxApiRequest.call(
                  this,
                  'GET',
                  '/inboxes',
                  undefined,
                  { limit: pageSize, offset },
                );
                const pageData = (response?.data ?? []) as IDataObject[];
                collected.push(...pageData);
                const total =
                  (response?.meta?.total as number | undefined) ??
                  collected.length;
                offset += pageData.length;
                if (pageData.length === 0 || collected.length >= total) {
                  break;
                }
              }
              returnData.push(...collected);
              continue;
            }

            const limit = this.getNodeParameter('limit', i, 50) as number;
            const offset = this.getNodeParameter('offset', i, 0) as number;
            response = await openInboxApiRequest.call(
              this,
              'GET',
              '/inboxes',
              undefined,
              { limit, offset },
            );
            const pageData = (response?.data ?? []) as IDataObject[];
            returnData.push(...pageData);
            continue;
          }
        }

        // =========================================================
        // EMAIL
        // =========================================================
        if (resource === 'email') {
          if (operation === 'getAll') {
            const inboxId = this.getNodeParameter('inboxId', i) as string;
            const unreadOnly = this.getNodeParameter(
              'unreadOnly',
              i,
              false,
            ) as boolean;
            const qs: IDataObject = {};
            if (unreadOnly) {
              qs.unreadOnly = true;
            }
            response = await openInboxApiRequest.call(
              this,
              'GET',
              `/inboxes/${encodeURIComponent(inboxId)}/emails`,
              undefined,
              qs,
            );
            const pageData = (response?.data ?? []) as IDataObject[];
            returnData.push(...pageData);
            continue;
          }

          if (operation === 'get') {
            const emailId = this.getNodeParameter('emailId', i) as string;
            response = await openInboxApiRequest.call(
              this,
              'GET',
              `/emails/${encodeURIComponent(emailId)}`,
            );
            returnData.push((response?.data ?? response) as IDataObject);
            continue;
          }

          if (operation === 'delete') {
            const emailId = this.getNodeParameter('emailId', i) as string;
            response = await openInboxApiRequest.call(
              this,
              'DELETE',
              `/emails/${encodeURIComponent(emailId)}`,
            );
            returnData.push(response as IDataObject);
            continue;
          }
        }

        // =========================================================
        // WEBHOOK
        // =========================================================
        if (resource === 'webhook') {
          if (operation === 'create') {
            const url = this.getNodeParameter('url', i) as string;
            const events = this.getNodeParameter('events', i) as string[];
            const secret = this.getNodeParameter('secret', i, '') as string;

            const body: IDataObject = { url, events };
            if (secret) {
              body.secret = secret;
            }

            response = await openInboxApiRequest.call(
              this,
              'POST',
              '/webhooks',
              body,
            );
            returnData.push((response?.data ?? response) as IDataObject);
            continue;
          }

          if (operation === 'getAll') {
            response = await openInboxApiRequest.call(this, 'GET', '/webhooks');
            const pageData = (response?.data ?? []) as IDataObject[];
            returnData.push(...pageData);
            continue;
          }

          if (operation === 'delete') {
            const webhookId = this.getNodeParameter('webhookId', i) as string;
            response = await openInboxApiRequest.call(
              this,
              'DELETE',
              `/webhooks/${encodeURIComponent(webhookId)}`,
            );
            returnData.push(response as IDataObject);
            continue;
          }
        }

        // =========================================================
        // ACCOUNT
        // =========================================================
        if (resource === 'account' && operation === 'get') {
          response = await openInboxApiRequest.call(this, 'GET', '/account');
          returnData.push((response?.data ?? response) as IDataObject);
          continue;
        }

        throw new NodeOperationError(
          this.getNode(),
          `Unsupported operation "${operation}" for resource "${resource}"`,
          { itemIndex: i },
        );
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ error: (error as Error).message });
          continue;
        }
        throw error;
      }
    }

    return [this.helpers.returnJsonArray(returnData)];
  }
}
