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

import {
  createMonitors,
  ok,
  formatAPIError,
  formatFailedMonitors,
  formatNotFoundError,
} from './request';
import { Monitor } from '../dsl/monitor';
import { PushOptions } from '../common_types';
import { buildMonitorSchema } from './monitor';
import { progress, error, done, indent } from '../helpers';
import { bold } from 'kleur/colors';

export async function push(monitors: Monitor[], options: PushOptions) {
  if (monitors.length === 0) {
    throw 'No Monitors found';
  }

  const duplicates = trackDuplicates(monitors);
  if (duplicates.size > 0) {
    throw error(formatDuplicateError(duplicates));
  }

  progress(`preparing all monitors`);
  const schemas = await buildMonitorSchema(monitors);
  try {
    progress(`creating all monitors`);
    const { body, statusCode } = await createMonitors(schemas, options);
    if (statusCode === 404) {
      throw formatNotFoundError(await body.text());
    }
    if (!ok(statusCode)) {
      const { error, message } = await body.json();
      throw formatAPIError(statusCode, error, message);
    }
    const { failedMonitors } = await body.json();
    if (failedMonitors.length > 0) {
      throw formatFailedMonitors(failedMonitors);
    }
    done('Pushed');
  } catch (e) {
    error(e);
  }
}

function trackDuplicates(monitors: Monitor[]) {
  const monitorMap: Map<string, Monitor> = new Map();
  const duplicates: Set<Monitor> = new Set();
  for (const monitor of monitors) {
    const id = monitor.config.id;
    if (monitorMap.has(id)) {
      duplicates.add(monitorMap.get(id));
      duplicates.add(monitor);
    }
    monitorMap.set(id, monitor);
  }
  return duplicates;
}

export function formatDuplicateError(monitors: Set<Monitor>) {
  let outer = bold(`Aborted: Duplicate monitors found\n`);

  let inner = '';
  for (const monitor of monitors) {
    const { config, source } = monitor;
    inner += `* ${config.id} - ${source.file}:${source.line}:${source.column}\n`;
  }
  outer += indent(inner);
  return outer;
}
