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

import {
  Browser,
  Page,
  BrowserContext,
  CDPSession,
  APIRequestContext,
} from 'playwright-core';
import { Step } from './step';
import { VoidCallback, HooksCallback, Params, Location, StatusValue } from '../common_types';
import { Monitor, MonitorConfig } from './monitor';
import { isMatch } from '../helpers';
import { RunnerInfo } from '../core/runner';

export type JourneyOptions = {
  name: string;
  id?: string;
  tags?: string[];
};

type HookType = 'before' | 'after';
export type Hooks = Record<HookType, Array<HooksCallback>>;
type JourneyCallbackOpts = {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Params;
  request: APIRequestContext;
  info: RunnerInfo;
};
export type JourneyCallback = (options: JourneyCallbackOpts) => void;

export class Journey {
  readonly name: string;
  readonly id?: string;
  readonly tags?: string[];
  readonly location?: Location;
  readonly steps: Step[] = [];
  #cb: JourneyCallback;
  #hooks: Hooks = { before: [], after: [] };
  #monitor: Monitor;
  skip = false;
  only = false;
  _startTime = 0;
  duration = -1;
  status: StatusValue = 'pending';
  error?: Error;

  constructor(
    options: JourneyOptions,
    cb: JourneyCallback,
    location?: Location
  ) {
    this.name = options.name;
    this.id = options.id || options.name;
    this.tags = options.tags;
    this.#cb = cb;
    this.location = location;
    this._updateMonitor({});
  }

  _addStep(name: string, cb: VoidCallback, location?: Location) {
    const step = new Step(name, this.steps.length + 1, cb, location);
    this.steps.push(step);
    return step;
  }

  _addHook(type: HookType, cb: HooksCallback) {
    this.#hooks[type].push(cb);
  }

  _getHook(type: HookType) {
    return this.#hooks[type];
  }

  _getMonitor() {
    return this.#monitor;
  }

  _updateMonitor(config: MonitorConfig) {
    /**
     * Use defaults values from journey for monitor object (id, name and tags)
     */
    this.#monitor = new Monitor({
      name: this.name,
      id: this.id,
      type: 'browser',
      tags: this.tags ?? [],
      ...config,
    });
    this.#monitor.setSource(this.location);
    this.#monitor.setFilter({ match: this.name });
  }

  get cb() {
    return this.#cb;
  }

  /**
   * Matches journeys based on the provided args. Proitize tags over match
   */
  _isMatch(matchPattern: string, tagsPattern: Array<string>) {
    return isMatch(this.tags, this.name, tagsPattern, matchPattern);
  }
}

type JourneyType = (
  options: string | JourneyOptions,
  callback: JourneyCallback
) => Journey;

export type JourneyWithAnnotations = JourneyType & {
  /**
   * Skip this journey and all its steps
   */
  skip: JourneyType;
  /**
   * Run only this journey and skip rest of the journeys
   */
  only: JourneyType;
};
