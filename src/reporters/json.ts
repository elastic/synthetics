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

import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { createHash } from 'crypto';
import BaseReporter from './base';
import {
  formatError,
  getTimestamp,
  CACHE_PATH,
  totalist,
  isDirectory,
} from '../helpers';
import { Journey, Step } from '../dsl';
import snakeCaseKeys from 'snakecase-keys';
import {
  NetworkInfo,
  TraceOutput,
  StatusValue,
  PerfMetrics,
} from '../common_types';
import { Protocol } from 'playwright-chromium/types/protocol';
import { Metrics } from '../plugins';

/* eslint-disable @typescript-eslint/no-var-requires */
const { version, name } = require('../../package.json');

type OutputType =
  | 'synthetics/metadata'
  | 'journey/register'
  | 'journey/start'
  | 'screenshot/block'
  | 'step/screenshot_ref'
  | 'step/screenshot'
  | 'step/end'
  | 'journey/network_info'
  | 'journey/filmstrips'
  | 'journey/browserconsole'
  | 'journey/metrics'
  | 'journey/end';

type Payload = {
  source?: string;
  start?: number;
  end?: number;
  url?: string;
  status?: StatusValue | number;
  metrics?: Metrics;
  params?: Record<string, unknown>;
  type?: OutputType;
  text?: string;
  index?: number;
};

type OutputFields = {
  type: OutputType;
  _id?: string;
  journey?: Journey;
  timestamp?: number;
  url?: string;
  step?: Partial<Step> & {
    duration?: {
      us: number;
    };
  };
  error?: Error;
  root_fields?: Record<string, unknown>;
  payload?: Payload | NetworkInfo;
  blob?: string;
  blob_mime?: string;
};

type ScreenshotBlob = {
  blob: string;
  id: string;
};

type ScreenshotReference = {
  width: number;
  height: number;
  blocks: Array<{
    hash: string;
    top: number;
    left: number;
    width: number;
    height: number;
  }>;
};

type ScreenshotOutput = {
  step: Step;
  blob_mime: string;
  blocks: Array<ScreenshotBlob>;
  reference: ScreenshotReference;
};

function getMetadata() {
  return {
    os: {
      platform: process.platform,
    },
    package: {
      name,
      version,
    },
  };
}

function formatVersion(protocol: string | undefined) {
  if (!protocol) {
    return;
  }
  if (protocol === 'h2') {
    return 2;
  } else if (protocol === 'http/1.1') {
    return 1.1;
  } else if (protocol === 'http/1.0') {
    return 1.0;
  } else if (protocol.startsWith('h3')) {
    return 3;
  }
}

function formatRequest(request: Protocol.Network.Request) {
  const postData = request.postData ? request.postData : '';
  return {
    ...request,
    body: {
      bytes: postData.length,
      content: postData,
    },
    referrer: request.headers?.Referer,
  };
}

function formatResponse(response: Protocol.Network.Response) {
  if (!response) {
    return;
  }
  return {
    ...response,
    body: {
      bytes: response.encodedDataLength,
    },
    status_code: response.status,
  };
}

function formatTLS(tls: Protocol.Network.SecurityDetails) {
  if (!tls) {
    return;
  }
  const cipher = `${tls.keyExchange ? tls.keyExchange + '_' : ''}${
    tls.cipher
  }_${tls.keyExchangeGroup}`;
  const [name, version] = tls.protocol.toLowerCase().split(' ');
  return {
    cipher,
    server: {
      x509: {
        issuer: {
          common_name: tls.issuer,
        },
        subject: {
          common_name: tls.subjectName,
        },
        not_after: new Date(tls.validTo * 1000).toISOString(),
        not_before: new Date(tls.validFrom * 1000).toISOString(),
      },
    },
    version_protocol: name,
    version: version,
  };
}

export function formatNetworkFields(network: NetworkInfo) {
  const { request, response, url, browser } = network;
  const ecs = {
    // URL would be parsed and mapped by heartbeat
    url,
    user_agent: {
      name: browser.name,
      version: browser.version,
      original: request.headers?.['User-Agent'],
    },
    http: {
      version: formatVersion(response?.protocol),
      request: formatRequest(request),
      response: formatResponse(response),
    },
    tls: formatTLS(response?.securityDetails),
  };

  const pickItems: Array<keyof NetworkInfo> = [
    'browser',
    'status',
    'method',
    'type',
    'isNavigationRequest',
    'requestSentTime',
    'responseReceivedTime',
    'loadEndTime',
    'transferSize',
    'resourceSize',
    'timings',
  ];
  const payload: Partial<NetworkInfo> = pickItems.reduce((acc, value) => {
    network[value] && (acc[value] = network[value]);
    return acc;
  }, {});

  return { ecs, payload };
}

function journeyInfo(
  journey: OutputFields['journey'],
  type: OutputFields['type'],
  status: Payload['status']
) {
  if (!journey) {
    return;
  }
  return {
    name: journey.name,
    id: journey.id,
    tags: journey.tags,
    status: type === 'journey/end' ? status : undefined,
  };
}

function stepInfo(
  step: OutputFields['step'],
  type: OutputFields['type'],
  status: Payload['status']
) {
  if (!step) {
    return;
  }
  return {
    name: step.name,
    index: step.index,
    status: type === 'step/end' ? status : undefined,
    duration: step.duration,
  };
}

export async function getScreenshotBlocks(screenshot: Buffer) {
  const img = sharp(screenshot, { sequentialRead: true });
  const { width, height } = await img.metadata();
  /**
   * Chop the screenshot image (1280*720) which is the default
   * viewport size in to 64 equal blocks for a given image
   * which can be acheived by keeping the division to 8
   *
   * Changing division to 16 would yield us 256 smaller blocks, but it is not
   * optimal for caching in the ES and proved out to be bad, so we stick to 8
   */
  const divisions = 8;
  const blockWidth = width / divisions;
  const blockHeight = height / divisions;
  const reference: ScreenshotReference = {
    width,
    height,
    blocks: [],
  };
  const blocks: Array<ScreenshotBlob> = [];

  for (let row = 0; row < divisions; row++) {
    const top = row * blockHeight;
    for (let col = 0; col < divisions; col++) {
      const left = col * blockWidth;
      const buf = await img
        .extract({ top, left, width: blockWidth, height: blockHeight })
        .jpeg()
        .toBuffer();

      const hash = createHash('sha1').update(buf).digest('hex');
      blocks.push({
        blob: buf.toString('base64'),
        id: hash,
      });
      /**
       * We dont write the width, height of individual blocks on the
       * reference as we use similar sized blocks for each extraction,
       * we would need to send the width and height here if we decide to
       * go with dynamic block extraction.
       */
      reference.blocks.push({
        hash,
        top,
        left,
        width: blockWidth,
        height: blockHeight,
      });
    }
  }

  return { blocks, reference, blob_mime: 'image/jpeg' };
}

/**
 * Get all the screenshots from the cached screenshot location
 * at the end of each journey and construct equally sized blocks out
 * of the individual screenshot image.
 */
export async function gatherScreenshots(
  screenshotsPath: string,
  callback: (step: Step, data: string) => Promise<void>
) {
  const screenshots: Array<ScreenshotOutput> = [];
  if (isDirectory(screenshotsPath)) {
    await totalist(screenshotsPath, async (_, absPath) => {
      try {
        const content = readFileSync(absPath, 'utf8');
        const { step, data } = JSON.parse(content);
        await callback(step, data);
      } catch (_) {
        // TODO: capture progarammatic synthetic errors under different type
      }
    });
  }
  return screenshots;
}

export default class JSONReporter extends BaseReporter {
  _registerListeners() {
    /**
     * report the number of journeys that exists on a suite which
     * could be used for better sharding
     */
    this.runner.on('start', ({ numJourneys }) => {
      this.writeJSON({
        type: 'synthetics/metadata',
        root_fields: {
          num_journeys: numJourneys,
        },
      });
    });

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
        payload: { params, source: journey.callback.toString() },
      });
    });

    this.runner.on(
      'step:end',
      ({ journey, step, start, end, error, url, status, metrics }) => {
        this.writeJSON({
          type: 'step/end',
          journey,
          step: {
            ...step,
            duration: {
              us: Math.trunc((end - start) * 1e6),
            },
          },
          url,
          error,
          payload: {
            source: step.callback.toString(),
            url,
            status,
            metrics,
          },
        });
      }
    );

    this.runner.on(
      'journey:end',
      async ({
        journey,
        start,
        end,
        filmstrips,
        networkinfo,
        browserconsole,
        userTiming,
        experience,
        metrics,
        status,
        error,
        ssblocks,
      }) => {
        await gatherScreenshots(
          join(CACHE_PATH, 'screenshots'),
          async (step, data) => {
            if (ssblocks) {
              const { blob_mime, blocks, reference } =
                await getScreenshotBlocks(Buffer.from(data, 'base64'));
              for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                this.writeJSON({
                  type: 'screenshot/block',
                  _id: block.id,
                  blob: block.blob,
                  blob_mime,
                });
              }
              this.writeJSON({
                type: 'step/screenshot_ref',
                journey,
                step,
                root_fields: {
                  screenshot_ref: reference,
                },
              });
            } else {
              this.writeJSON({
                type: 'step/screenshot',
                journey,
                step,
                blob: data,
                blob_mime: 'image/jpeg',
              });
            }
          }
        );

        if (networkinfo) {
          networkinfo.forEach(ni => {
            const { ecs, payload } = formatNetworkFields(ni);
            this.writeJSON({
              type: 'journey/network_info',
              journey,
              timestamp: ni.timestamp,
              root_fields: snakeCaseKeys(ecs),
              step: ni.step,
              payload: snakeCaseKeys(payload),
            });
          });
        }
        if (filmstrips) {
          // Write each filmstrip separately so that we don't get documents that are too large
          filmstrips.forEach((strip, index) => {
            this.writeJSON({
              type: 'journey/filmstrips',
              journey,
              payload: { index },
              root_fields: {
                browser: {
                  relative_trace: strip.relative_trace,
                },
              },
              blob: strip.blob,
              blob_mime: strip.mime,
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
              payload: { text, type } as Payload,
            });
          });
        }
        this.writeMetrics(
          journey,
          'relative_trace',
          experience.concat(...userTiming)
        );
        this.writeMetrics(journey, 'experience', metrics);

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
        this.runner.emit('journey:end:reported', {});
      }
    );
  }

  writeMetrics(
    journey: Journey,
    type: string,
    events: Array<TraceOutput> | Partial<PerfMetrics>
  ) {
    const metrics = Array.isArray(events) ? events : [events];
    metrics.forEach(event => {
      event &&
        this.writeJSON({
          type: 'journey/metrics',
          journey,
          root_fields: {
            browser: {
              [type]: event,
            },
          },
        });
    });
  }

  // Writes a structered synthetics event
  // Note that blob is ultimately stored in ES as a base64 encoded string. You must base 64 encode
  // it before passing it into this function!
  // The payload field is an un-indexed field with no ES mapping, so users can put arbitary structured
  // stuff in there
  writeJSON({
    _id,
    journey,
    type,
    timestamp,
    step,
    root_fields,
    error,
    payload,
    blob,
    blob_mime,
    url,
  }: OutputFields) {
    this.write({
      type,
      _id,
      '@timestamp': timestamp || getTimestamp(),
      journey: journeyInfo(journey, type, payload?.status),
      step: stepInfo(step, type, payload?.status),
      root_fields: { ...(root_fields || {}), ...getMetadata() },
      payload,
      blob,
      blob_mime,
      error: formatError(error),
      url,
      package_version: version,
    });
  }
}
