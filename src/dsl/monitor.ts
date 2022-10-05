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

import merge from 'deepmerge';
import { bold, red } from 'kleur/colors';
import {
  ThrottlingOptions,
  Location,
  ScreenshotOptions,
  Params,
  PlaywrightOptions,
} from '../common_types';
import { indent } from '../helpers';
import { LocationsMap } from '../locations/public-locations';

export type SyntheticsLocationsType = keyof typeof LocationsMap;
export const SyntheticsLocations = Object.keys(
  LocationsMap
) as SyntheticsLocationsType[];
export const ALLOWED_SCHEDULES = [3, 5, 10, 15, 30, 60, 120, 240] as const;

export type MonitorConfig = {
  id?: string;
  name?: string;
  type?: string;
  tags?: string[];
  schedule?: typeof ALLOWED_SCHEDULES[number];
  enabled?: boolean;
  locations?: SyntheticsLocationsType[];
  privateLocations?: string[];
  throttling?: ThrottlingOptions;
  screenshot?: ScreenshotOptions;
  params?: Params;
  playwrightOptions?: PlaywrightOptions;
};

type MonitorFilter = {
  match: string;
  tags?: string[];
};

export class Monitor {
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
        return [...new Set(source)];
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
   * If journey files are colocated within the same file during
   * push command, when we invoke synthetics from HB we rely on
   * this filter for running that specific journey alone instead of
   * all journeys on the file
   */
  setFilter(filter: MonitorFilter) {
    this.filter = filter;
  }

  validate() {
    const schedule = this.config.schedule;
    if (ALLOWED_SCHEDULES.includes(schedule) || !this.source) {
      return;
    }
    const { config, source } = this;
    let outer = bold(
      `Invalid schedule: ${schedule}, allowed values are ${ALLOWED_SCHEDULES.join(
        ','
      )}\n`
    );
    const inner = `* ${config.id} - ${source.file}:${source.line}:${source.column}\n`;
    outer += indent(inner);
    throw red(outer);
  }
}
