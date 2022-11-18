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
import { removeTrailingSlash } from '../helpers';
import { MonitorHashID, MonitorSchema } from './monitor';
import {
  formatAPIError,
  formatNotFoundError,
  ok,
  sendRequest,
} from './request';

// Default chunk size for bulk put / delete
const chunkSize = 125;

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

  for (let i = 0; i < schemas.length; i += chunkSize) {
    const chunk = schemas.slice(i, i + chunkSize);

    const url =
      removeTrailingSlash(options.url) +
      `/s/${options.space}/api/synthetics/project/${options.id}/monitors/_bulk_update`;

    const { statusCode, body: respBody } = await sendRequest({
      url,
      method: 'PUT',
      auth: options.auth,
      body: JSON.stringify({ monitors: chunk }),
    });

    const parsedResp = (await parseAndCheck(
      statusCode,
      url,
      respBody
    )) as BulkPutResponse;
    result.createdMonitors.push(...parsedResp.createdMonitors);
    result.updatedMonitors.push(...parsedResp.updatedMonitors);
    result.failedMonitors.push(...parsedResp.failedMonitors);
  }

  return result;
}

type GetResponse = {
  total: number;
  monitors: MonitorHashID[];
};

type AfterKey = {
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
    const { body, statusCode } = await sendRequest({
      url,
      method: 'GET',
      auth: options.auth,
    });
    const resp = (await parseAndCheck(statusCode, url, body)) as GetResponse &
      AfterKey;
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
): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < monitorIDs.length; i += chunkSize) {
    const chunk = monitorIDs.slice(i, i + chunkSize);

    const url =
      removeTrailingSlash(options.url) +
      `/s/${options.space}/api/synthetics/project/${options.id}/monitors/_bulk_delete`;
    const { body, statusCode } = await sendRequest({
      url,
      method: 'DELETE',
      auth: options.auth,
      body: JSON.stringify({ monitors: chunk }),
    });

    (await parseAndCheck(statusCode, url, body)) as DeleteResponse;
    totalDeleted += chunk.length;
  }

  return totalDeleted;
}

// Check for any bad status codes and attempt to read the body, returning the parsed JSON
async function parseAndCheck(
  statusCode: number,
  url: string,
  body
): Promise<any> {
  if (statusCode === 404) {
    throw formatNotFoundError(url, await body.text());
  } else if (!ok(statusCode)) {
    let parsed: { error: string; message: string };
    try {
      parsed = await body.json();
    } catch (e) {
      throw formatAPIError(
        statusCode,
        'unexpected non-JSON error',
        await body.text()
      );
    }
    throw formatAPIError(statusCode, parsed.error, parsed.message);
  }

  return await body.json();
}
