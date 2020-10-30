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

/* eslint-disable @typescript-eslint/no-var-requires */
const programVersion = require('../../package.json').version;

export default class JSONReporter extends BaseReporter {
  _registerListeners() {
    this.runner.on('journey:register', ({ journey }) => {
      this.writeJSON('journey/register', journey, {});
    });

    this.runner.on('journey:start', ({ journey, timestamp, params }) => {
      this.writeJSON('journey/start', journey, {
        timestamp,
        payload: { params, source: journey.callback.toString },
      });
    });

    this.runner.on(
      'step:end',
      ({
        journey,
        step,
        timestamp,
        start,
        end,
        error,
        screenshot,
        url,
        status,
        metrics,
      }) => {
        if (screenshot) {
          this.writeJSON('step/screenshot', journey, {
            step,
            blob: screenshot,
          });
        }
        this.writeJSON('step/end', journey, {
          step,
          timestamp,
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
        timestamp,
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
            this.writeJSON('journey/network_info', journey, {
              payload: snakeCaseKeys(ni),
            });
          });
        }
        if (filmstrips) {
          // Write each filmstrip separately so that we don't get documents that are too large
          filmstrips.forEach((strip, index) => {
            this.writeJSON('journey/filmstrips', journey, {
              payload: {
                index,
                ...{
                  name: strip.name,
                  ts: strip.ts,
                },
              },
              blob: strip.snapshot,
            });
          });
        }
        if (browserconsole) {
          browserconsole.forEach(({ timestamp, text, type, step }) => {
            this.writeJSON('journey/browserconsole', journey, {
              step,
              payload: { timestamp, text, type },
            });
          });
        }
        this.writeJSON('journey/end', journey, {
          timestamp,
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
  writeJSON(
    type: string,
    journey: Journey,
    {
      timestamp,
      step,
      error,
      payload,
      blob,
      url,
    }: {
      timestamp?: number;
      url?: string;
      step?: Partial<Step>;
      error?: Error;
      payload?: { [key: string]: any };
      blob?: string;
    }
  ) {
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
      payload,
      blob,
      error: formatError(error),
      url,
      package_version: programVersion,
    });
  }
}
