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
import { renderError, serializeError, stripAnsiCodes } from './reporter-util';
import {
  getTimestamp,
  CACHE_PATH,
  totalist,
  isDirectory,
  getDurationInUs,
  processStart,
} from '../helpers';
import { Journey, Step } from '../dsl';
import snakeCaseKeys from 'snakecase-keys';
import {
  NetworkInfo,
  SecurityDetails,
  NetworkConditions,
  TraceOutput,
  StatusValue,
  PerfMetrics,
  Screenshot,
  StartEvent,
  JourneyStartResult,
  StepEndResult,
  JourneyEndResult,
  PageMetrics,
} from '../common_types';
import { inspect } from 'util';

/* eslint-disable @typescript-eslint/no-var-requires */
const { version, name } = require('../../package.json');

type OutputType =
  | 'synthetics/metadata'
  | 'journey/register'
  | 'journey/start'
  | 'screenshot/block'
  | 'step/screenshot_ref'
  | 'step/screenshot'
  | 'step/metrics'
  | 'step/filmstrips'
  | 'step/end'
  | 'journey/network_info'
  | 'journey/browserconsole'
  | 'journey/end';

type Payload = {
  source?: string;
  url?: string;
  browser_delay_us?: number;
  process_startup_epoch_us?: number;
  status?: StatusValue;
  pagemetrics?: PageMetrics;
  type?: OutputType;
  text?: string;
  index?: number;
  network_conditions?: NetworkConditions;
};

type Duration = {
  duration?: {
    us: number;
  };
};

type JourneyInfo = Omit<Partial<Journey>, 'duration'> & Duration;
type StepInfo = Omit<Partial<Step>, 'duration'> & Duration;

type OutputFields = {
  type: OutputType;
  _id?: string;
  journey?: Partial<Journey>;
  timestamp?: number;
  url?: string;
  step?: Partial<Step>;
  error?: Error;
  root_fields?: Record<string, unknown>;
  payload?: Payload;
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

function formatTLS(tls: SecurityDetails) {
  if (!tls || !tls.protocol) {
    return;
  }
  const [name, version] = tls.protocol.toLowerCase().split(' ');
  return {
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
    version,
  };
}

/**
 * List of wildcard header keys that should be sanitized/redacted from the request/response headers
 *
 * Spec followed by APM agent is used as a reference.
 * https://github.com/elastic/apm/blob/36a5abd49ff156c80cf0c9e2e1eac919873cb18b/specs/agents/sanitization.md?plain=1#L27
 */
const SANITIZE_HEADER_KEYS = [
  /^password$/i,
  /^secret$/i,
  /^.*key$/i,
  /^.*token.*$/i,
  /^.*session.*$/i,
  /^.*auth.*$/i,
  /^cookie$/i,
  /^set\x2dcookie$/i,
];
export function redactKeys(obj: Record<string, string> = {}) {
  const result = {};
  for (const key of Object.keys(obj)) {
    const shouldRedact = SANITIZE_HEADER_KEYS.some(regex => regex.test(key));
    result[key] = shouldRedact ? '[REDACTED]' : obj[key];
  }
  return result;
}

export function formatNetworkFields(network: NetworkInfo) {
  const { request, response, url, browser } = network;
  // Perform redaction on the headers before writing results
  if (request?.headers) {
    request.headers = redactKeys(request.headers);
  }
  if (response?.headers) {
    response.headers = redactKeys(response.headers);
  }

  const ecs = {
    // URL would be parsed and mapped by heartbeat
    url,
    user_agent: {
      name: browser.name,
      version: browser.version,
      original: request.headers?.['User-Agent'],
    },
    http: {
      request,
      response,
    },
    tls: formatTLS(response?.securityDetails),
  };

  const pickItems: Array<keyof NetworkInfo> = [
    'browser',
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

/**
 * formatJSONError formats the error in a structured format
 * we restructure the error with code frame and stack trace for test errors
 */
function formatJSONError(error: Error | any) {
  if (error == null) {
    return;
  }

  // Early exit for non Error objects
  if (!(error instanceof Error) || !error.stack) {
    return { message: `thrown: ${inspect(error)}` };
  }

  /**
   * Do not highlight source for these errors and strip ANSI codes
   */
  return {
    name: error.name,
    message: stripAnsiCodes(error.message.split('\n')[0]),
    stack: stripAnsiCodes(renderError(serializeError(error, false))),
  };
}

function journeyInfo(journey: Partial<Journey>, type: OutputFields['type']) {
  if (!journey) {
    return;
  }
  const info: JourneyInfo = {
    name: journey.name,
    id: journey.id,
    tags: journey.tags,
  };
  const isEnd = type === 'journey/end';
  if (isEnd) {
    info.status = journey.status;
    info.duration = { us: getDurationInUs(journey.duration) };
  }
  return info;
}

function stepInfo(
  step: Partial<Step>,
  type: OutputFields['type']
): Omit<Partial<Step>, 'duration'> & Duration {
  if (!step) {
    return;
  }
  const info: StepInfo = { name: step.name, index: step.index };
  const isEnd = type === 'step/end';
  if (isEnd) {
    info.status = step.status;
    info.duration = { us: getDurationInUs(step.duration) };
  }
  return info;
}

export async function getScreenshotBlocks(screenshot: Buffer) {
  const { width, height } = await sharp(screenshot).metadata();
  /**
   * Chop the screenshot image (1280*720) which is the default
   * viewport size in to 64 equal blocks for a given image
   * which can be acheived by keeping the division to 8
   *
   * Changing division to 16 would yield us 256 smaller blocks, but it is not
   * optimal for caching in the ES and proved out to be bad, so we stick to 8
   */
  const divisions = 8;
  const blockWidth = Math.floor(width / divisions);
  const blockHeight = Math.floor(height / divisions);
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
      // We create a new sharp instance for each block to avoid
      // running in to extraction/orientation issues
      const buf = await sharp(screenshot, { sequentialRead: true })
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
  callback: (data: Screenshot) => Promise<void>
) {
  if (isDirectory(screenshotsPath)) {
    await totalist(screenshotsPath, async (_, absPath) => {
      try {
        const content = readFileSync(absPath, 'utf8');
        const screenshot: Screenshot = JSON.parse(content);
        await callback(screenshot);
      } catch (_) {
        // TODO: capture progarammatic synthetic errors under different type
      }
    });
  }
}

export default class JSONReporter extends BaseReporter {
  onStart(event: StartEvent) {
    /**
     * report the number of journeys that exists on a suite which
     * could be used for better sharding
     */
    this.writeJSON({
      type: 'synthetics/metadata',
      root_fields: {
        num_journeys: event.numJourneys,
      },
      payload: event.networkConditions
        ? {
            network_conditions: event.networkConditions,
          }
        : undefined,
    });
  }

  override onJourneyRegister(journey: Journey): void {
    this.writeJSON({
      type: 'journey/register',
      journey,
    });
  }

  override onJourneyStart(journey: Journey, { timestamp }: JourneyStartResult) {
    this.writeJSON({
      type: 'journey/start',
      journey,
      timestamp,
      payload: { source: journey.cb.toString() },
    });
  }

  override onStepEnd(
    journey: Journey,
    step: Step,
    { pagemetrics, traces, metrics, filmstrips }: StepEndResult
  ) {
    this.writeMetrics(journey, step, 'relative_trace', traces);
    this.writeMetrics(journey, step, 'experience', metrics);
    if (filmstrips) {
      // Write each filmstrip separately so that we don't get documents that are too large
      filmstrips.forEach((strip, index) => {
        this.writeJSON({
          type: 'step/filmstrips',
          journey,
          step,
          payload: { index },
          root_fields: {
            browser: { relative_trace: { start: strip.start } },
          },
          blob: strip.blob,
          blob_mime: strip.mime,
        });
      });
    }

    this.writeJSON({
      type: 'step/end',
      journey,
      step,
      url: step.url,
      error: step.error,
      payload: {
        source: step.cb.toString(),
        url: step.url,
        status: step.status,
        pagemetrics,
      },
    });
  }

  override async onJourneyEnd(
    journey: Journey,
    {
      timestamp,
      browserDelay,
      networkinfo,
      browserconsole,
      options,
    }: JourneyEndResult
  ) {
    const { ssblocks, screenshots } = options;
    const writeScreenshots =
      screenshots === 'on' ||
      (screenshots === 'only-on-failure' && journey.status === 'failed');
    if (writeScreenshots) {
      await gatherScreenshots(
        join(CACHE_PATH, 'screenshots'),
        async screenshot => {
          const { data, timestamp, step } = screenshot;
          if (!data) {
            return;
          }
          if (ssblocks) {
            await this.writeScreenshotBlocks(journey, screenshot);
          } else {
            this.writeJSON({
              type: 'step/screenshot',
              timestamp,
              journey,
              step,
              blob: data,
              blob_mime: 'image/jpeg',
            });
          }
        }
      );
    }

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

    if (browserconsole) {
      browserconsole.forEach(({ timestamp, text, type, step }) => {
        this.writeJSON({
          type: 'journey/browserconsole',
          journey,
          timestamp,
          step,
          payload: {
            text,
            type,
          } as Payload,
        });
      });
    }

    this.writeJSON({
      type: 'journey/end',
      journey,
      timestamp,
      error: journey.error,
      payload: {
        status: journey.status,
        // convert from monotonic seconds time to microseconds
        browser_delay_us: getDurationInUs(browserDelay),
        // timestamp in microseconds at which the current node process began, measured in Unix time.
        process_startup_epoch_us: Math.trunc(processStart * 1000),
      },
    });
  }

  override onEnd() {
    this.stream.flushSync();
  }

  async writeScreenshotBlocks(journey: Journey, screenshot: Screenshot) {
    const { blob_mime, blocks, reference } = await getScreenshotBlocks(
      Buffer.from(screenshot.data, 'base64')
    );
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      this.writeJSON({
        type: 'screenshot/block',
        timestamp: screenshot.timestamp,
        _id: block.id,
        blob: block.blob,
        blob_mime,
      });
    }
    this.writeJSON({
      type: 'step/screenshot_ref',
      timestamp: screenshot.timestamp,
      journey,
      step: screenshot.step,
      root_fields: {
        screenshot_ref: reference,
      },
    });
  }

  writeMetrics(
    journey: Journey,
    step: Step,
    type: string,
    events: Array<TraceOutput> | PerfMetrics
  ) {
    const metrics = Array.isArray(events) ? events : [events];
    metrics.forEach(event => {
      event &&
        this.writeJSON({
          type: 'step/metrics',
          journey,
          step,
          root_fields: {
            browser: {
              [type]: event,
            },
          },
        });
    });
  }

  // Writes a structured synthetics event
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
      journey: journeyInfo(journey, type),
      step: stepInfo(step, type),
      root_fields: { ...(root_fields || {}), ...getMetadata() },
      payload,
      blob,
      blob_mime,
      error: formatJSONError(error),
      url,
      package_version: version,
    });
  }
}
