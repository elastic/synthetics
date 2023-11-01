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

import type { ConsoleMessage, WebError } from 'playwright-core';
import { BrowserMessage, Driver, StatusValue } from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

const DEFAULT_MSG_LIMIt = 1000;
const SUCCESSFUL_MSG_LIMIT = 100;

const allowedTypes = ['error', 'warning', 'log'];

export class BrowserConsole {
  private messages: BrowserMessage[] = [];
  _currentStep: Partial<Step> = null;

  constructor(private driver: Driver) {}

  private consoleEventListener = (msg: ConsoleMessage) => {
    if (!this._currentStep) {
      return;
    }
    const type = msg.type();
    if (allowedTypes.includes(type)) {
      const { name, index } = this._currentStep;
      this.messages.push({
        timestamp: getTimestamp(),
        text: msg.text(),
        type,
        step: { name, index },
      });

      this.enforceMessagesLimit();
    }
  };

  private webErrorListener = (webErr: WebError) => {
    if (!this._currentStep) {
      return;
    }
    const { name, index } = this._currentStep;
    const error = webErr.error();
    this.messages.push({
      timestamp: getTimestamp(),
      text: error.message,
      type: 'error',
      step: { name, index },
    });

    this.enforceMessagesLimit();
  };

  private enforceMessagesLimit() {
    if (this.messages.length > DEFAULT_MSG_LIMIt) {
      this.messages.splice(0, 1);
    }
  }

  start() {
    log(`Plugins: started collecting console events`);
    this.driver.context.on('console', this.consoleEventListener);
    this.driver.context.on('weberror', this.webErrorListener);
  }

  stop() {
    this.driver.context.off('console', this.consoleEventListener);
    this.driver.context.off('weberror', this.webErrorListener);
    log(`Plugins: stopped collecting console events`);
    return this.messages;
  }
}

export function filterBrowserMessages(
  messages: BrowserMessage[],
  status: StatusValue
) {
  if (status == 'skipped') {
    return [];
  } else if (status === 'failed' || messages.length <= SUCCESSFUL_MSG_LIMIT) {
    return messages;
  }
  // collect 100 messages from the browser console when the test is successful,
  // giving priority to errors and warnings
  const result = messages.filter(msg => msg.type === 'error');
  if (result.length >= SUCCESSFUL_MSG_LIMIT) {
    return result.slice(-SUCCESSFUL_MSG_LIMIT);
  }

  // collect warnings
  result.push(...messages.filter(msg => msg.type === 'warning'));
  if (result.length >= SUCCESSFUL_MSG_LIMIT) {
    return result.slice(-SUCCESSFUL_MSG_LIMIT);
  }

  // collect logs
  result.push(...messages.filter(msg => msg.type === 'log'));
  return result.slice(-SUCCESSFUL_MSG_LIMIT);
}
