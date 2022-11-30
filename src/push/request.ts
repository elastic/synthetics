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

import { bold, red, yellow } from 'kleur/colors';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
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

export async function sendReqAndHandleError<T>(
  options: APIRequestOptions
): Promise<T> {
  const { statusCode, body } = await sendRequest({
    url: options.url,
    method: options.method,
    auth: options.auth,
    body: options.body,
  });

  return await (await handleError(statusCode, options.url, body)).json();
}

// Handle bad status code errors from Kibana API and format the
// error message to be displayed to the user.
// returns the response stream if no error is found
export async function handleError(
  statusCode: number,
  url: string,
  body: Dispatcher.ResponseData['body']
): Promise<Dispatcher.ResponseData['body']> {
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

  return body;
}

export function ok(statusCode: number) {
  return statusCode >= 200 && statusCode <= 299;
}

export type APIMonitorError = {
  id?: string;
  reason: string;
  details: string;
};

export function formatNotFoundError(url: string, message: string) {
  return red(
    bold(
      `${symbols['failed']} Please check your kibana url ${url} and try again - 404:${message}`
    )
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
  return red(outer);
}

function formatMonitorError(errors: APIMonitorError[]) {
  let outer = '';
  for (const error of errors) {
    const monitorId = error.id ? `: monitor(${error.id})` : '';
    let inner = bold(`> ${error.reason}${monitorId}\n`);
    inner += indent(error.details, '    ');
    outer += indent(inner) + '\n';
    outer += '\n';
  }
  return outer;
}

export function formatFailedMonitors(errors: APIMonitorError[]) {
  const heading = bold(`${symbols['failed']} Error\n`);
  return red(heading + formatMonitorError(errors));
}

export function formatStaleMonitors(errors: APIMonitorError[]) {
  const heading = bold(`${symbols['warning']} Warnings\n`);
  return yellow(heading + formatMonitorError(errors));
}
