import {
  IExecuteFunctions,
  IDataObject,
  IHttpRequestMethods,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  IHookFunctions,
  IWebhookFunctions,
  NodeApiError,
  JsonObject,
} from 'n8n-workflow';

import {
  CREDENTIALS_NAME,
  OPENINBOX_API_PREFIX,
  OPENINBOX_DEFAULT_BASE_URL,
} from './constants';

interface OpenInboxCredentials {
  apiKey: string;
  baseUrl: string;
}

/**
 * Build the absolute URL for an API call against the user-configured base URL.
 */
function buildUrl(baseUrl: string, path: string): string {
  const normalisedBase = (baseUrl || OPENINBOX_DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalisedBase}${OPENINBOX_API_PREFIX}${normalisedPath}`;
}

/**
 * Wrapper around `this.helpers.httpRequestWithAuthentication` that injects the
 * configured base URL and centralises error handling using `NodeApiError`.
 *
 * Works for execute, hook, load-options and webhook function contexts.
 */
export async function openInboxApiRequest(
  this:
    | IExecuteFunctions
    | IHookFunctions
    | ILoadOptionsFunctions
    | IWebhookFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject | undefined = undefined,
  qs: IDataObject | undefined = undefined,
): Promise<any> {
  const credentials = (await this.getCredentials(
    CREDENTIALS_NAME,
  )) as unknown as OpenInboxCredentials;

  const options: IHttpRequestOptions = {
    method,
    url: buildUrl(credentials.baseUrl, endpoint),
    json: true,
  };

  if (qs && Object.keys(qs).length > 0) {
    options.qs = qs;
  }

  if (body !== undefined && Object.keys(body).length > 0) {
    options.body = body;
  }

  try {
    return await this.helpers.httpRequestWithAuthentication.call(
      this,
      CREDENTIALS_NAME,
      options,
    );
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject, {
      message: `OpenInbox API request failed: ${(error as Error).message ?? 'unknown error'}`,
    });
  }
}
