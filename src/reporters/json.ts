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

import BaseReporter from './base';
import { formatError, getTimestamp } from '../helpers';
import { Journey, Step } from '../dsl';
import snakeCaseKeys from 'snakecase-keys';
import { NetworkInfo } from '../common_types';

/* eslint-disable @typescript-eslint/no-var-requires */
const { version, name } = require('../../package.json');

type OutputType =
  | 'journey/register'
  | 'journey/start'
  | 'step/screenshot'
  | 'step/end'
  | 'journey/network_info'
  | 'journey/filmstrips'
  | 'journey/browserconsole'
  | 'journey/end';

type OutputFields = {
  type: OutputType;
  journey: Journey;
  timestamp?: number;
  url?: string;
  step?: Partial<Step>;
  error?: Error;
  root_fields?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  blob?: string;
};

function getMetadata() {
  return {
    process: {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      args: process.argv,
    },
    os: {
      platform: process.platform,
    },
    package: {
      name,
      version,
    },
  };
}

function formatHttpVersion(protocol: string) {
  if (protocol === 'h2') {
    return 2;
  } else if (protocol === 'http/1.1') {
    return 1.1;
  } else if (protocol === 'http/1.0') {
    return 1.0;
  }
  return;
}

function formatECSFields(network: NetworkInfo) {
  const { request, response, url } = network;
  const postdata = request.postData || '';
  const tls = response?.securityDetails;

  return {
    // URL and USER AGENT would be parsed and mapped by heartbeat
    url,
    user_agent: request.headers['user_agent'],
    http: {
      version: formatHttpVersion(response?.protocol),
      request: {
        body: {
          bytes: postdata.length,
          content: postdata,
        },
        method: request.method,
        referrer: request.headers['referer'],
      },
      response: response
        ? {
            body: {
              bytes: response.encodedDataLength,
            },
            mime_type: response.mimeType,
            status_code: response.status,
          }
        : undefined,
    },
    tls: tls
      ? {
          cipher: tls.cipher,
          client: {
            issuer: tls.issuer,
            not_after: new Date(tls.validTo).toISOString(),
            not_before: new Date(tls.validFrom).toISOString(),
          },
        }
      : undefined,
  };
}

export default class JSONReporter extends BaseReporter {
  _registerListeners() {
    this.runner.on('journey:register', ({ journey }) => {
      this.writeJSON({
        type: 'journey/register',
        journey,
      });
    });

    this.runner.on('journey:start', ({ journey, timestamp, params }) => {
      this.writeJSON({
        type: 'journey/start',
        journey,
        timestamp,
        payload: { params, source: journey.callback.toString },
      });
    });

    this.runner.on(
      'step:end',
      ({
        journey,
        step,
        start,
        end,
        error,
        screenshot,
        url,
        status,
        metrics,
      }) => {
        if (screenshot) {
          this.writeJSON({
            type: 'step/screenshot',
            journey,
            step,
            blob: screenshot,
          });
        }
        this.writeJSON({
          type: 'step/end',
          journey,
          step,
          url,
          error,
          payload: {
            source: step.callback.toString(),
            start,
            end,
            url,
            status,
            metrics,
          },
        });
      }
    );

    this.runner.on(
      'journey:end',
      ({
        journey,
        start,
        end,
        filmstrips,
        networkinfo,
        browserconsole,
        status,
        error,
      }) => {
        if (networkinfo) {
          networkinfo.forEach(ni => {
            this.writeJSON({
              type: 'journey/network_info',
              journey,
              timestamp: ni.timestamp,
              root_fields: formatECSFields(ni),
              step: ni.step,
              payload: snakeCaseKeys(ni),
            });
          });
        }
        if (filmstrips) {
          // Write each filmstrip separately so that we don't get documents that are too large
          filmstrips.forEach((strip, index) => {
            this.writeJSON({
              type: 'journey/filmstrips',
              journey,
              payload: {
                index,
                ...{
                  startTime: strip.startTime,
                  ts: strip.ts,
                },
              },
              blob: strip.snapshot,
            });
          });
        }
        if (browserconsole) {
          browserconsole.forEach(({ timestamp, text, type, step }) => {
            this.writeJSON({
              type: 'journey/browserconsole',
              journey,
              timestamp,
              step,
              payload: { text, type },
            });
          });
        }
        this.writeJSON({
          type: 'journey/end',
          journey,
          error,
          payload: {
            start,
            end,
            status,
          },
        });
      }
    );
  }

  // Writes a structered synthetics event
  // Note that blob is ultimately stored in ES as a base64 encoded string. You must base 64 encode
  // it before passing it into this function!
  // The payload field is an un-indexed field with no ES mapping, so users can put arbitary structured
  // stuff in there
  writeJSON({
    journey,
    type,
    timestamp,
    step,
    root_fields,
    error,
    payload,
    blob,
    url,
  }: OutputFields) {
    this.write({
      type,
      '@timestamp': timestamp || getTimestamp(),
      journey: {
        name: journey.name,
        id: journey.id,
      },
      step: step
        ? {
            name: step.name,
            index: step.index,
          }
        : undefined,
      root_fields: { ...(root_fields || {}), ...getMetadata() },
      payload,
      blob,
      error: formatError(error),
      url,
      package_version: version,
    });
  }
}
