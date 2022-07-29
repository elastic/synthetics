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

import { bold } from 'kleur/colors';
import { Dispatcher, request } from 'undici';
import { indent, symbols } from '../helpers';

/* eslint-disable @typescript-eslint/no-var-requires */
const { version } = require('../../package.json');

export type APIRequestOptions = {
  url: string;
  method: Dispatcher.HttpMethod;
  auth: string;
  body?: string;
};

export async function sendRequest(options: APIRequestOptions) {
  return await request(options.url, {
    method: options.method,
    body: options.body,
    headers: {
      authorization: `ApiKey ${options.auth}`,
      'content-type': 'application/json',
      'user-agent': `Elastic/Synthetics ${version}`,
      'kbn-xsrf': 'true',
    },
  });
}

export function ok(statusCode: number) {
  return statusCode >= 200 && statusCode <= 299;
}

export type APIMonitorError = {
  id?: string;
  reason: string;
  details: string;
};

export function formatNotFoundError(message: string) {
  return bold(
    `${symbols['failed']} Please check your kibana url and try again - 404:${message}`
  );
}

export function formatAPIError(
  statuCode: number,
  error: string,
  message: string
) {
  let outer = bold(`${symbols['failed']} Error\n`);
  let inner = bold(
    `${symbols['failed']} monitor creation failed - ${statuCode}:${error}\n`
  );
  inner += indent(message, '    ');
  outer += indent(inner);
  return outer;
}

export function formatFailedMonitors(errors: APIMonitorError[]) {
  let outer = bold(`${symbols['failed']} Error\n`);
  for (const error of errors) {
    const monitorId = error.id ? `: monitor(${error.id})` : '';
    let inner = bold(`> ${error.reason}${monitorId}\n`);
    inner += indent(error.details, '    ');
    outer += indent(inner) + '\n';
    outer += '\n';
  }
  return outer;
}
