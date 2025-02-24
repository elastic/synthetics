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

import { createHash } from 'crypto';
import merge from 'deepmerge';
import { bold, red } from 'kleur/colors';
import {
  ThrottlingOptions,
  Location,
  ScreenshotOptions,
  Params,
  PlaywrightOptions,
} from '../common_types';
import { indent, isMatch } from '../helpers';
import { LocationsMap } from '../locations/public-locations';

export type SyntheticsLocationsType = keyof typeof LocationsMap;
export const SyntheticsLocations = Object.keys(
  LocationsMap
) as SyntheticsLocationsType[];
export const ALLOWED_SCHEDULES = [
  1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 240,
] as const;

export interface AlertConfig {
  status?: {
    enabled: boolean;
  };
  tls?: {
    enabled: boolean;
  };
}

export type MonitorConfig = {
  id?: string;
  name?: string;
  type?: string;
  tags?: string[];
  fields?: Record<string, string>;
  schedule?: typeof ALLOWED_SCHEDULES[number];
  enabled?: boolean;
  locations?: SyntheticsLocationsType[];
  privateLocations?: string[];
  serviceName?: string;
  /**
   * @deprecated This option is ignored.
   * Network throttling via chrome devtools is ignored at the moment.
   * See https://github.com/elastic/synthetics/blob/main/docs/throttling.md for more details.
   */
  throttling?: boolean | ThrottlingOptions;
  screenshot?: ScreenshotOptions;
  params?: Params;
  playwrightOptions?: PlaywrightOptions;
  alert?: AlertConfig;
  /**
   * By default, the monitor will be retested on failure
   */
  retestOnFailure?: boolean;
};

type MonitorFilter = {
  match: string;
  tags?: string[];
};

export class Monitor {
  content?: string;
  source?: Location;
  filter: MonitorFilter;
  constructor(public config: MonitorConfig = {}) {}
  /**
   * Treat the creation time config with `monitor.use` as source of truth by
   * merging the values coming from CLI and Synthetics config file
   */
  update(globalOpts: MonitorConfig = {}) {
    this.config = merge(globalOpts, this.config, {
      arrayMerge(target, source) {
        if (source && source.length > 0) {
          return [...new Set(source)];
        }
        return target;
      },
    });
  }

  get type() {
    return this.config.type;
  }

  setSource(source: Location) {
    this.source = source;
  }

  /**
   * The underlying journey code of the monitor
   * along with its dependencies
   */
  setContent(content = '') {
    this.content = content;
  }

  /**
   * If journey files are colocated within the same file during
   * push command, when we invoke synthetics from HB we rely on
   * this filter for running that specific journey alone instead of
   * all journeys on the file
   */
  setFilter(filter: MonitorFilter) {
    this.filter = filter;
  }

  /**
   * Matches monitors based on the provided args. Proitize tags over match
   */
  isMatch(matchPattern: string, tagsPattern: Array<string>) {
    return isMatch(
      this.config.tags,
      this.config.name,
      tagsPattern,
      matchPattern
    );
  }

  /**
   * Hash is used to identify if the monitor has changed since the last time
   * it was pushed to Kibana. Change is based on three factors:
   * - Monitor configuration
   * - Code changes
   * - File path changes
   */
  hash(): string {
    const hash = createHash('sha256');
    return hash
      .update(JSON.stringify(this.config))
      .update(this.content || '')
      .update(this.source?.file || '')
      .digest('base64');
  }

  /**
   * Returns the size of the monitor in bytes which is sent as payload to Kibana
   */
  size() {
    return JSON.stringify(this).length;
  }

  validate() {
    const schedule = this.config.schedule;
    if (ALLOWED_SCHEDULES.includes(schedule)) {
      return;
    }
    const { config, source } = this;
    let outer = bold(
      `Invalid schedule: ${schedule}, allowed values are ${ALLOWED_SCHEDULES.join(
        ','
      )}\n`
    );
    if (source) {
      const inner = `* ${config.id} - ${source.file}:${source.line}:${source.column}\n`;
      outer += indent(inner);
    }
    throw red(outer);
  }
}
