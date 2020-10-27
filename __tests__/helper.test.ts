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

import { cwd } from 'process';
import {
  indent,
  getMonotonicTime,
  formatError,
  findPkgJsonByTraversing,
  generateTempPath,
} from '../src/helpers';

it('indent message with seperator', () => {
  // tabWidth: 2
  const separator = ' ';
  const message = 'hello world';
  expect(indent(message, separator)).toEqual(separator + message);
});

it('get monotonic clock time', () => {
  jest.spyOn(process, 'hrtime').mockImplementation(() => {
    return [1, 1e7];
  });
  const elapsedTime = getMonotonicTime();
  expect(elapsedTime).toBe(1.01);
});

it('format errors', () => {
  const error = new Error('testing');
  const { name, message, stack } = error;
  const formatted = formatError(error);
  expect(formatted).toStrictEqual({
    name,
    message,
    stack,
  });
});

it('throw error when no package.json found', async () => {
  try {
    const tempPath = generateTempPath();
    await findPkgJsonByTraversing(tempPath, cwd());
  } catch (e) {
    expect(e).toMatch('Could not find package.json file in');
  }
});
