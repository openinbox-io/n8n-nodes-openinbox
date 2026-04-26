import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

import {
  OPENINBOX_API_KEY_HEADER,
  OPENINBOX_API_PREFIX,
  OPENINBOX_DEFAULT_BASE_URL,
} from '../nodes/OpenInbox/constants';

/**
 * Credentials for the OpenInbox API.
 *
 * The OpenInbox backend (NestJS) authenticates API requests via the
 * `X-API-Key` HTTP header (see `backend/src/guards/api-key.guard.ts`).
 * API keys are issued to Pro / Business / 7-Day Pass tier accounts at
 * https://openinbox.io.
 */
export class OpenInboxApi implements ICredentialType {
  name = 'openInboxApi';

  displayName = 'OpenInbox API';

  documentationUrl = 'https://openinbox.io/api-docs';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description:
        'Your OpenInbox API key. Generate one in the OpenInbox dashboard at https://openinbox.io. Sent in the X-API-Key request header.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: OPENINBOX_DEFAULT_BASE_URL,
      required: true,
      description:
        'Base URL of the OpenInbox API. Leave as default unless you are running a self-hosted instance. Do NOT include the /api/v1 path — it is appended automatically.',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        [OPENINBOX_API_KEY_HEADER]: '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: `${OPENINBOX_API_PREFIX}/account`,
      method: 'GET',
    },
  };
}
