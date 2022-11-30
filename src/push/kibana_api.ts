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
import { removeTrailingSlash, safeNDJSONParse } from '../helpers';
import { MonitorHashID, MonitorSchema } from './monitor';
import {
  formatFailedMonitors,
  formatStaleMonitors,
  handleError,
  sendReqAndHandleError,
  sendRequest,
} from './request';

// Default chunk size for bulk put / delete
export const CHUNK_SIZE = 200;

type BulkPutResponse = {
  createdMonitors: string[];
  updatedMonitors: string[];
  failedMonitors: string[];
};

export async function bulkPutMonitors(
  options: PushOptions,
  schemas: MonitorSchema[]
): Promise<BulkPutResponse> {
  const result: BulkPutResponse = {
    createdMonitors: [],
    updatedMonitors: [],
    failedMonitors: [],
  };
  const url =
    removeTrailingSlash(options.url) +
    `/s/${options.space}/api/synthetics/project/${options.id}/monitors/_bulk_update`;
  const resp = await sendReqAndHandleError<BulkPutResponse>({
    url,
    method: 'PUT',
    auth: options.auth,
    body: JSON.stringify({ monitors: schemas }),
  });
  result.createdMonitors.push(...resp.createdMonitors);
  result.updatedMonitors.push(...resp.updatedMonitors);
  result.failedMonitors.push(...resp.failedMonitors);

  return result;
}

type GetResponse = {
  total: number;
  monitors: MonitorHashID[];
  after_key?: string;
};

export async function bulkGetMonitors(
  options: PushOptions
): Promise<GetResponse> {
  let afterKey = null;
  let total = 0;
  const monitors: MonitorHashID[] = [];
  do {
    let url =
      removeTrailingSlash(options.url) +
      `/s/${options.space}/api/synthetics/project/${options.id}/monitors`;
    if (afterKey) {
      url += `?search_after=${afterKey}`;
    }
    const resp = await sendReqAndHandleError<GetResponse>({
      url,
      method: 'GET',
      auth: options.auth,
    });
    afterKey = resp.after_key;

    // The first page gives the total number of monitors
    if (total == 0) {
      total = resp.total;
    }
    monitors.push(...resp.monitors);
  } while (afterKey);

  return { total, monitors };
}

type DeleteResponse = {
  deleted_monitors: string[];
};

export async function bulkDeleteMonitors(
  options: PushOptions,
  monitorIDs: string[]
) {
  const url =
    removeTrailingSlash(options.url) +
    `/s/${options.space}/api/synthetics/project/${options.id}/monitors/_bulk_delete`;

  return await sendReqAndHandleError<DeleteResponse>({
    url,
    method: 'DELETE',
    auth: options.auth,
    body: JSON.stringify({ monitors: monitorIDs }),
  });
}

type StatusResponse = {
  version: {
    number: number;
  };
};

export async function getVersion(options: PushOptions) {
  const url =
    removeTrailingSlash(options.url) + `/s/${options.space}/api/status`;
  const data = await sendReqAndHandleError<StatusResponse>({
    url,
    method: 'GET',
    auth: options.auth,
  });
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
  const url =
    removeTrailingSlash(options.url) +
    `/s/${options.space}/api/synthetics/service/project/monitors`;
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
