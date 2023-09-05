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

import semver from 'semver';
import { progress, removeTrailingSlash } from '../helpers';
import { green, red, grey, yellow } from 'kleur/colors';
import { PushOptions } from '../common_types';
import { Monitor } from '../dsl/monitor';

export function logDiff<T extends Set<string>>(
  newIDs: T,
  changedIDs: T,
  removedIDs: T,
  unchangedIDs: T
) {
  progress(
    'Monitor Diff: ' +
      green(`Added(${newIDs.size}) `) +
      yellow(`Updated(${changedIDs.size}) `) +
      red(`Removed(${removedIDs.size}) `) +
      grey(`Unchanged(${unchangedIDs.size})`)
  );
}

export function getChunks(arr: any[], size: number) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type Operation =
  | 'status'
  | 'bulk_get'
  | 'bulk_update'
  | 'bulk_delete'
  | 'legacy'
  | 'location';

export function generateURL(options: PushOptions, operation: Operation) {
  const url = removeTrailingSlash(options.url);
  switch (operation) {
    case 'status':
      return `${url}/s/${options.space}/api/stats`;
    case 'bulk_get':
    case 'bulk_update':
    case 'bulk_delete':
      return `${url}/s/${options.space}/api/synthetics/project/${options.id}/monitors`;
    case 'legacy':
      return `${url}/s/${options.space}/api/synthetics/service/project/monitors`;
    case 'location':
      return `${url}/internal/uptime/service/locations`;
    default:
      throw new Error('Invalid operation');
  }
}

/**
 * Bulk API is supported for push monitors only from 8.6.0 and above
 */
export function isBulkAPISupported(version: string) {
  return semver.satisfies(version, '>=8.6.0');
}

/**
 * Lightweight monitors are supported only from 8.5.0 and above
 */
export function isLightweightMonitorSupported(
  monitors: Monitor[],
  options: PushOptions
) {
  const version = options.kibanaVersion;
  return (
    semver.satisfies(version, '<8.5.0') &&
    monitors.some(monitor => monitor.type !== 'browser')
  );
}

/**
 * Lighweight monitor param options are supported only from
 * 8.7.2 and above
 */
export function isParamOptionSupported(version: string) {
  return semver.satisfies(version, '>=8.7.2');
}
