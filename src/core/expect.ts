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

/* eslint-disable @typescript-eslint/no-var-requires */
const expectLib = require('../../dist/bundles/lib/index').expect;

type ExpectLibrary =
  typeof import('../../bundles/node_modules/@playwright/test/types/test').expect;

// exclude toHaveScreenshot and toMatchSnapshot from expect
// since they are not supported in synthetics
expectLib.extend({
  toHaveScreenshot: () => {
    throw new Error('toHaveScreenshot is not supported in elastic synthetics.');
  },
  toMatchSnapshot: () => {
    throw new Error('toHaveScreenshot is not supported in elastic synthetics.');
  },
});

export const expect: ExpectLibrary = expectLib;
