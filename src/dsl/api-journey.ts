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

import { APIRequestContext } from 'playwright-core';
import { Location, Params } from '../common_types';

import { Journey } from './journey';
import { Monitor, MonitorConfig } from './monitor';
import { RunnerInfo } from '../core/runner';

export type APIJourneyOptions = {
  name: string;
  id?: string;
  tags?: string[];
};

export type APIJourneyCallbackOpts = {
  params: Params;
  request: APIRequestContext;
  info: RunnerInfo;
};
export type APIJourneyCallback = (options: APIJourneyCallbackOpts) => void;

type APIJourneyType = (
  options: string | APIJourneyOptions,
  callback: APIJourneyCallback
) => APIJourney;

/**
 * Same step-based model as a browser `Journey` but without a Chromium
 * context. `type === 'api'` lets the runner/gatherer/plugin-manager skip
 * browser-only setup.
 */
export class APIJourney extends Journey {
  constructor(
    options: APIJourneyOptions | string,
    cb: APIJourneyCallback,
    location?: Location
  ) {
    const opts =
      typeof options === 'string'
        ? { name: options, id: options }
        : { ...options };
    // Runner narrows callback args by `journey.type`, so the cast is sound.
    super({ ...opts, type: 'api' }, cb as any, location);
  }

  // Register as an `api` project monitor on `synthetics push`.
  override _updateMonitor(config: MonitorConfig) {
    this._setMonitor(
      new Monitor({
        name: this.name,
        id: this.id,
        type: 'api',
        tags: this.tags ?? [],
        ...config,
      })
    );
  }
}

export type APIJourneyWithAnnotations = APIJourneyType & {
  /**
   * Skip this journey and all its steps
   */
  skip: APIJourneyType;
  /**
   * Run only this journey and skip rest of the journeys
   */
  only: APIJourneyType;
};
