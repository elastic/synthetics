/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { PushOptions } from '../common_types';
import { safeNDJSONParse } from '../helpers';
import { MonitorHashID, MonitorSchema } from './monitor';
import {
  formatFailedMonitors,
  formatStaleMonitors,
  handleError,
  sendReqAndHandleError,
  sendRequest,
  APIMonitorError,
} from './request';
import { generateURL } from './utils';

// Default chunk size for bulk put / delete
export const CHUNK_SIZE = 100;

export type PutResponse = {
  createdMonitors: string[];
  updatedMonitors: string[];
  failedMonitors: APIMonitorError[];
};

export async function bulkPutMonitors(
  options: PushOptions,
  schemas: MonitorSchema[]
) {
  const resp = await sendReqAndHandleError<PutResponse>({
    url: generateURL(options, 'bulk_update') + '/_bulk_update',
    method: 'PUT',
    auth: options.auth,
    body: JSON.stringify({ monitors: schemas }),
  });
  const { failedMonitors } = resp;
  if (failedMonitors && failedMonitors.length > 0) {
    throw formatFailedMonitors(failedMonitors);
  }
  return resp;
}

export type GetResponse = {
  total: number;
  monitors: MonitorHashID[];
  after_key?: string;
};

export async function bulkGetMonitors(
  options: PushOptions
): Promise<GetResponse> {
  const allMonitors: MonitorHashID[] = [];

  const resp = await fetchMonitors(options);
  allMonitors.push(...resp.monitors);
  let afterKey = resp.afterKey;
  const total = resp.total;

  while (allMonitors.length < total) {
    const resp = await fetchMonitors(options, afterKey);
    allMonitors.push(...resp.monitors);
    afterKey = resp.afterKey;
  }

  return {
    total,
    monitors: allMonitors,
  };
}

const fetchMonitors = async (options: PushOptions, afterKey?: string) => {
  let url = generateURL(options, 'bulk_get');
  if (afterKey) {
    url += `?search_after=${afterKey}`;
  }
  const resp = await sendReqAndHandleError<GetResponse>({
    url,
    method: 'GET',
    auth: options.auth,
  });
  return {
    afterKey: resp.after_key,
    total: resp.total,
    monitors: resp.monitors,
  };
};

export type DeleteResponse = {
  deleted_monitors: string[];
};

export async function bulkDeleteMonitors(
  options: PushOptions,
  monitorIDs: string[]
) {
  return await sendReqAndHandleError<DeleteResponse>({
    url: generateURL(options, 'bulk_delete') + '/_bulk_delete',
    method: 'DELETE',
    auth: options.auth,
    body: JSON.stringify({ monitors: monitorIDs }),
  });
}

type StatusResponse = {
  version?: {
    number?: string;
  };
};

export async function getVersion(options: PushOptions) {
  const data = await sendReqAndHandleError<StatusResponse>({
    url: generateURL(options, 'status'),
    method: 'GET',
    auth: options.auth,
  });

  if (!data.version || typeof data.version?.number === 'undefined') {
    throw Error(
      'Unable to retrieve version. Are your auth credentials correct?'
    );
  }

  return data.version.number;
}

export type LegacyAPISchema = {
  project: string;
  keep_stale: boolean;
  monitors: MonitorSchema[];
};

export async function createMonitorsLegacy({
  schemas,
  keepStale,
  options,
}: {
  schemas: MonitorSchema[];
  keepStale: boolean;
  options: PushOptions;
}) {
  const schema: LegacyAPISchema = {
    project: options.id,
    keep_stale: keepStale,
    monitors: schemas,
  };
  const url = generateURL(options, 'legacy');
  const { body, statusCode } = await sendRequest({
    url,
    method: 'PUT',
    auth: options.auth,
    body: JSON.stringify(schema),
  });

  const resBody = await handleError(statusCode, url, body);
  const allchunks = [];
  for await (const data of resBody) {
    allchunks.push(Buffer.from(data));
  }
  const chunks = safeNDJSONParse(Buffer.concat(allchunks).toString('utf-8'));
  // Its kind of hacky for now where Kibana streams the response by
  // writing the data as NDJSON events (data can be interleaved), we
  // distinguish the final data by checking if the event was a progress vs complete event
  for (const chunk of chunks) {
    if (typeof chunk === 'string') {
      // Ignore the progress from Kibana as we chunk the requests
      continue;
    }
    const { failedMonitors, failedStaleMonitors } = chunk;
    if (failedMonitors && failedMonitors.length > 0) {
      throw formatFailedMonitors(failedMonitors);
    }
    if (failedStaleMonitors.length > 0) {
      throw formatStaleMonitors(failedStaleMonitors);
    }
  }
}
