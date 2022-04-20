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
import { ThrottlingOptions } from '../common_types';

export type SyntheticsLocations = 'US East' | 'EU West';
export type MonitorConfig = {
  id?: string;
  name?: string;
  schedule?: string;
  locations?: SyntheticsLocations[];
  throttling?: ThrottlingOptions;
};

export class Monitor {
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
}
