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

import { Request, Route } from 'playwright-core';
import { ApmOptions, Driver } from '../common_types';

export class Apm {
  constructor(
    private driver: Driver,
    private options: ApmOptions,
    private monitorId: string,
    private checkgroup: string
  ) {}

  async traceHandler(route: Route, request: Request) {
    const baggage = `monitor.id:${this.monitorId};monitor.check_group:${this.checkgroup}`;
    const headers = {
      ...(await request.allHeaders()),
      baggage,
    };
    route.continue({
      headers,
    });
  }

  async start() {
    for (const pattern of this.options.traceUrlPatterns) {
      await this.driver.context.route(pattern, this.traceHandler.bind(this));
    }
  }

  async stop() {
    for (const pattern of this.options.traceUrlPatterns) {
      await this.driver.context.unroute(pattern, this.traceHandler.bind(this));
    }
  }
}
