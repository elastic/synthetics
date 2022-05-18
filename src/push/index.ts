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

import { bold, cyan, green, red } from 'kleur/colors';
import {
  createMonitors,
  ok,
  formatAPIError,
  formatFailedMonitors,
  formatStaleMonitors,
} from './request';
import { Monitor } from '../dsl/monitor';
import { PushOptions } from '../common_types';
import { buildMonitorSchema } from './monitor';
import { symbols } from '../helpers';

function write(message: string) {
  process.stderr.write(message + '\n');
}

function progress(message: string) {
  write(cyan(bold(`${symbols.progress} ${message}`)));
}

function error(message: string) {
  write(red(message));
}

function done(message: string) {
  write(bold(green(`${symbols['succeeded']} ${message}`)));
}

export async function push(monitors: Monitor[], options: PushOptions) {
  progress(`preparing all monitors`);
  const schemas = await buildMonitorSchema(monitors);
  try {
    progress(`creating all monitors`);
    const { body, statusCode } = await createMonitors(schemas, options);
    if (!ok(statusCode)) {
      const { error, message } = await body.json();
      throw formatAPIError(statusCode, error, message);
    }
    const { staleMonitors, failedMonitors } = await body.json();
    if (failedMonitors.length > 0) {
      throw formatFailedMonitors(failedMonitors);
    }
    if (staleMonitors.length > 0) {
      write(formatStaleMonitors());
    }
    done('Pushed');
  } catch (e) {
    error(e);
  }
}
