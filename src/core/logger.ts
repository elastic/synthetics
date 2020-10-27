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

import SonicBoom from 'sonic-boom';
import { grey, cyan, dim, italic } from 'kleur/colors';
import { now } from '../helpers';

const defaultFd = process.stdout.fd;
let logger = new SonicBoom({ fd: defaultFd });

export const setLogger = (fd: number) => {
  if (fd && fd !== defaultFd) {
    logger = new SonicBoom({ fd });
  }
  return logger;
};

export function log(msg) {
  if (!process.env.DEBUG || !msg) {
    return;
  }
  if (typeof msg === 'object') {
    msg = JSON.stringify(msg);
  }
  const time = dim(cyan(`at ${parseInt(String(now()))} ms `));
  logger.write(time + italic(grey(msg)) + '\n');
}
