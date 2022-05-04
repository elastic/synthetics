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

import { request } from 'undici';
import { PushOptions } from '../common_types';
import { MonitorSchema } from './monitor';

/* eslint-disable @typescript-eslint/no-var-requires */
const { version } = require('../../package.json');

export type APISchema = {
  space: string;
  keep_stale: boolean;
  monitors: MonitorSchema[];
};

function encodeAuth(auth: string) {
  if (auth.includes(':')) {
    return Buffer.from(auth).toString('base64');
  }
  return auth;
}

export async function createMonitor(
  monitors: MonitorSchema[],
  options: PushOptions
) {
  const schema: APISchema = {
    space: options.space,
    keep_stale: !options.delete,
    monitors,
  };

  return await request(options.url, {
    method: 'POST',
    body: JSON.stringify(schema),
    headers: {
      authorization: `Basic ${encodeAuth(options.auth)}`,
      'content-type': 'application/json',
      'user-agent': `Elastic/Synthetics ${version}`,
    },
  });
}
