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

import { HttpMethod } from 'undici/types/dispatcher';
import { PushOptions } from '../common_types';
import { removeTrailingSlash } from '../helpers';
import {
  formatAPIError,
  formatNotFoundError,
  ok,
  sendRequest,
} from './request';

export type MonitorData = {
  journey_id?: string;
  hash?: string;
};

type GetResponse = {
  total: number;
  monitors: MonitorData[];
};

export function generateURL(options: PushOptions, method: HttpMethod) {
  switch (method) {
    case 'GET':
      return (
        removeTrailingSlash(options.url) +
        `/s/${options.space}/api/synthetics/project/${options.id}/monitors`
      );
    case 'PUT':
      return '';
    case 'DELETE':
      return '';
  }
  throw 'Method not supported';
}

export async function getAllMonitors(options: PushOptions) {
  const { body, statusCode } = await sendRequest({
    url: generateURL(options, 'GET'),
    method: 'GET',
    auth: options.auth,
  });

  if (statusCode === 404) {
    throw formatNotFoundError(await body.text());
  }
  if (!ok(statusCode)) {
    const { error, message } = await body.json();
    throw formatAPIError(statusCode, error, message);
  }

  const { monitors } = (await body.json()) as GetResponse;
  return monitors;
}
