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
  start?: number;
  end?: number;
  url?: string;
  status?: StatusValue;
  pagemetrics?: PageMetrics;
  type?: OutputType;
  text?: string;
  index?: number;
  network_conditions?: NetworkConditions;
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
function formatJSONError(error: Error | any, type: OutputType) {
  if (error == null) {
    return;
  }

  /**
   * Do not process browser errors - console.error and unhandled exceptions
   */
  if (type != null && type === 'journey/browserconsole') {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
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
      payload: { source: journey.callback.toString() },
    });
  }

  override onStepEnd(
    journey: Journey,
    step: Step,
    {
      start,
      end,
      error,
      url,
      status,
      pagemetrics,
      traces,
      metrics,
      filmstrips,
    }: StepEndResult
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
      step: {
        ...step,
        duration: {
          us: getDurationInUs(end - start),
        },
      },
      url,
      error,
      payload: {
        source: step.callback.toString(),
        url,
        status,
        pagemetrics,
      },
    });
  }

  override async onJourneyEnd(
    journey: Journey,
    {
      timestamp,
      start,
      end,
      networkinfo,
      browserconsole,
      status,
      error,
      options,
    }: JourneyEndResult
  ) {
    const { ssblocks, screenshots } = options;
    const writeScreenshots =
      screenshots === 'on' ||
      (screenshots === 'only-on-failure' && status === 'failed');
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
      browserconsole.forEach(({ timestamp, text, type, step, error }) => {
        this.writeJSON({
          type: 'journey/browserconsole',
          journey,
          timestamp,
          step,
          error,
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
      error,
      payload: {
        start,
        end,
        status,
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
      journey: journeyInfo(journey, type, payload?.status),
      step: stepInfo(step, type, payload?.status),
      root_fields: { ...(root_fields || {}), ...getMetadata() },
      payload,
      blob,
      blob_mime,
      error: formatJSONError(error, type),
      url,
      package_version: version,
    });
  }
}
