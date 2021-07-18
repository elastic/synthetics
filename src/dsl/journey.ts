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

import { Browser, Page, BrowserContext, CDPSession } from 'playwright-chromium';
import micromatch, { isMatch } from 'micromatch';
import { Step } from './step';
import { VoidCallback, HooksCallback, Params } from '../common_types';

export type JourneyOptions = {
  name: string;
  id?: string;
  tags?: string[];
};

type HookType = 'before' | 'after';
export type Hooks = Record<HookType, Array<HooksCallback>>;
export type JourneyCallback = (options: {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Params;
}) => void;

export class Journey {
  name: string;
  id?: string;
  tags?: string[];
  callback: JourneyCallback;
  steps: Step[] = [];
  hooks: Hooks = { before: [], after: [] };

  constructor(options: JourneyOptions, callback: JourneyCallback) {
    this.name = options.name;
    this.id = options.id || options.name;
    this.tags = options.tags;
    this.callback = callback;
  }

  addStep(name: string, callback: VoidCallback) {
    const step = new Step(name, this.steps.length + 1, callback);
    this.steps.push(step);
    return step;
  }

  addHook(type: HookType, callback: HooksCallback) {
    this.hooks[type].push(callback);
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
