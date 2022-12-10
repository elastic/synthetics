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
} from 'playwright-chromium';
import micromatch, { isMatch } from 'micromatch';
import { Step } from './step';
import { VoidCallback, HooksCallback, Params, Location, JourneyHookType } from '../common_types';
import { Monitor, MonitorConfig } from './monitor';

export type JourneyOptions = {
  name: string;
  id?: string;
  tags?: string[];
};

export type Hooks = Record<JourneyHookType, Array<HooksCallback>>;
export type JourneyCallback = (options: {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Params;
  request: APIRequestContext;
}) => void;

export class Journey {
  name: string;
  id?: string;
  tags?: string[];
  callback: JourneyCallback;
  location?: Location;
  steps: Step[] = [];
  hooks: Hooks = { before: [], after: [] };
  monitor: Monitor;

  constructor(
    options: JourneyOptions,
    callback: JourneyCallback,
    location?: Location
  ) {
    this.name = options.name;
    this.id = options.id || options.name;
    this.tags = options.tags;
    this.callback = callback;
    this.location = location;
    this.updateMonitor({});
  }

  addStep(name: string, callback: VoidCallback, location?: Location) {
    const step = new Step(name, this.steps.length + 1, callback, location);
    this.steps.push(step);
    return step;
  }

  addHook(type: JourneyHookType, callback: HooksCallback) {
    this.hooks[type].push(callback);
  }

  updateMonitor(config: MonitorConfig) {
    /**
     * Use defaults values from journey for monitor object (id, name and tags)
     */
    this.monitor = new Monitor({
      name: this.name,
      id: this.id,
      type: 'browser',
      tags: this.tags ?? [],
      ...config,
    });
    this.monitor.setSource(this.location);
    this.monitor.setFilter({ match: this.name });
  }

  /**
   * Matches journeys based on the provided args. Proitize tags over match
   * - tags pattern that matches only tags
   * - match pattern that matches both name and tags
   */
  isMatch(matchPattern: string, tagsPattern: Array<string>) {
    if (tagsPattern) {
      return this.tagsMatch(tagsPattern);
    }
    if (matchPattern) {
      return isMatch(this.name, matchPattern) || this.tagsMatch(matchPattern);
    }
    return true;
  }

  tagsMatch(pattern) {
    const matchess = micromatch(this.tags || ['*'], pattern);
    return matchess.length > 0;
  }
}
