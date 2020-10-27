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
import { Step } from './step';
import { VoidCallback } from '../common_types';

export type JourneyOptions = {
  name: string;
  id?: string;
};

type HookType = 'before' | 'after';
export type Hooks = Record<HookType, Array<VoidCallback>>;

export type JourneyCallback = (options: {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Record<string, any>;
}) => Promise<void>;

export class Journey {
  name: string;
  id?: string;
  callback: JourneyCallback;
  steps: Step[] = [];
  hooks: Hooks = { before: [], after: [] };

  constructor(options: JourneyOptions, callback: JourneyCallback) {
    this.name = options.name;
    this.id = options.id;
    this.callback = callback;
  }

  addStep(name: string, callback: VoidCallback) {
    const step = new Step(name, this.steps.length + 1, callback);
    this.steps.push(step);
    return step;
  }

  addHook(type: HookType, callback: VoidCallback) {
    this.hooks[type].push(callback);
  }
}
