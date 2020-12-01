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

import { Page } from 'playwright-chromium';
import { DefaultPluginOutput } from '../common_types';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

export type BrowserMessage = {
  text: string;
  type: string;
} & DefaultPluginOutput;

const defaultMessageLimit = 1000;

export class BrowserConsole {
  private messages: BrowserMessage[] = [];
  _currentStep: Partial<Step> = null;

  private consoleEventListener = msg => {
    if (!this._currentStep) {
      return;
    }
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      const { name, index } = this._currentStep;
      this.messages.push({
        timestamp: getTimestamp(),
        text: msg.text(),
        type,
        step: { name, index },
      });
      if (this.messages.length > defaultMessageLimit) {
        this.messages.splice(0, 1);
      }
    }
  };

  constructor(private page: Page) {}

  start() {
    this.page.on('console', this.consoleEventListener);
  }

  stop() {
    this.page.off('console', this.consoleEventListener);
    return this.messages;
  }
}
