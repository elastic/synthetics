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

import { join } from 'path';

/**
 * This file is a workaround to extend the expect functionality from Playwright package
 * with few extensions that we don't support in Synthetics.
 *
 * We are requiring the package using absolute path to workaround the Module
 * resolution export issues.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const PW_PATH = require.resolve('playwright').replace('index.js', '');
const expectLib = require(join(PW_PATH, 'lib/matchers/expect')).expect;

function notSupported(name: string) {
  throw new Error(`expect.${name} is not supported in @elastic/synthetics.`);
}

/**
 * Exclude toHaveScreenshot and toMatchSnapshot from our custom expect
 * since they are expected to be running inside PW test runner for it to work properly.
 */
expectLib.extend({
  toHaveScreenshot: () => notSupported('toHaveScreenshot'),
  toMatchSnapshot: () => notSupported('toMatchSnapshot'),
});

export const expect: typeof import('playwright/types/test').expect = expectLib;
