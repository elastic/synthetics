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

import { BrowserMessage, Driver } from '../common_types';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';
import * as util from 'util';

const defaultMessageLimit = 1000;

export class JourneyConsole {
  private messages: BrowserMessage[] = [];
  _currentStep: Partial<Step> = null;

  constructor(private driver: Driver) {}

  private consoleEventListener = ({
    text,
    type,
  }: {
    text: string;
    type: string;
  }) => {
    if (!this._currentStep) {
      return;
    }
    const { name, index } = this._currentStep;
    this.messages.push({
      timestamp: getTimestamp(),
      text: text,
      type,
      step: { name, index },
    });

    this.enforceMessagesLimit();
  };

  private enforceMessagesLimit() {
    if (this.messages.length > defaultMessageLimit) {
      this.messages.splice(0, 1);
    }
  }

  start() {
    const console = global.console;
    const levels = ['trace', 'log', 'info', 'debug', 'warn', 'error'];

    levels.forEach(methodName => {
      const originalMethod = console[methodName];

      console[methodName] = (...args) => {
        const params = Array.prototype.slice.call(args, 1);
        const message = params.length
          ? util.format(args[0], ...params)
          : util.format(args[0]);
        this.consoleEventListener({
          text: message,
          type: methodName,
        });

        // call the original method like "console.log"
        originalMethod.apply(console, args);
      };
    });
  }

  stop() {
    return this.messages;
  }
}
