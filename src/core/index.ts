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

import { Journey, JourneyCallback, JourneyOptions } from '../dsl';
import Runner from './runner';
import { VoidCallback } from '../common_types';
import { log } from './logger';

export const runner = new Runner();

export const journey = (
  options: JourneyOptions | string,
  callback: JourneyCallback
) => {
  log(`register journey: ${options}`)
  if (typeof options === 'string') {
    options = { name: options, id: options };
  }
  const j = new Journey(options, callback);
  runner.addJourney(j);
  return j;
};

export const step = (name: string, callback: VoidCallback) => {
  log(`register step: ${name}`)
  return runner.currentJourney?.addStep(name, callback);
};

export const beforeAll = (callback: VoidCallback) => {
  runner.addHook('beforeAll', callback);
};

export const afterAll = (callback: VoidCallback) => {
  runner.addHook('afterAll', callback);
};

export const before = (callback: VoidCallback) => {
  if (!runner.currentJourney) {
    throw new Error('before is called outside of the journey context');
  }
  return runner.currentJourney.addHook('before', callback);
};

export const after = (callback: VoidCallback) => {
  if (!runner.currentJourney) {
    throw new Error('after is called outside of the journey context');
  }
  return runner.currentJourney.addHook('after', callback);
};
