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

import { Frame, Page, Request } from 'playwright-core';
import { NetworkInfo, APIDriver } from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

/**
 * Kibana UI expects the requestStartTime and loadEndTime to be baseline
 * in seconds as they have the logic to convert it to milliseconds before
 * using for offset calculation
 */
function epochTimeInSeconds() {
  return getTimestamp() / 1e6;
}

const roundMilliSecs = (value: number): number => {
  return Math.floor(value * 1000) / 1000;
};

export class APINetworkManager {
  private _barrierPromises = new Set<Promise<void>>();
  results: Array<NetworkInfo> = [];
  _currentStep: Partial<Step> = null;
  _originalMethods: any;

  constructor(private driver: APIDriver) {
    this._originalMethods = {};
  }

  /**
   * Adds a protection barrier aganist all asynchronous extract operations from
   * request/response object that are happening during page lifecycle, If the
   * page is closed during the extraction, the barrier enforces those operations
   * to not result in exception
   */
  private _addBarrier(page: Page, promise: Promise<void>) {
    if (!page) return;
    const race = Promise.race([
      new Promise<void>(resolve =>
        page.on('close', () => {
          this._barrierPromises.delete(race);
          resolve();
        })
      ),
      promise,
    ]);
    this._barrierPromises.add(race);
    race.then(() => this._barrierPromises.delete(race));
  }

  private _nullableFrameBarrier(req: Request): Frame | null {
    try {
      return req.frame();
    } catch (_) {
      // frame might be unavailable for certain requests if they are issued
      // before the frame is created - true for navigation requests
      // https://playwright.dev/docs/api/class-request#request-frame
    }
    return null;
  }

  async start() {
    log(`Plugins: started collecting network events`);
    const { request } = this.driver;

    // Intercept API requests
    ['fetch', 'get', 'post', 'put', 'delete', 'patch', 'head'].forEach(
      method => {
        this._originalMethods[method] = request[method].bind(request);
        request[method] = this._interceptRequest.bind(this, method);
      }
    );
  }

  async _interceptRequest(method, url, options: any) {
    const timestamp = getTimestamp();
    const requestStartTime = epochTimeInSeconds();

    log(`Intercepting request: ${url}`);

    const requestEntry = {
      step: this._currentStep,
      timestamp,
      url,
      type: 'fetch',
      request: {
        url,
        method: method.toUpperCase(),
        headers: options?.headers || {},
        body: options?.postData || options?.data || null,
      },
      response: {
        status: -1,
        headers: {},
        mimeType: 'x-unknown',
      },
      requestSentTime: requestStartTime,
      loadEndTime: -1,
      responseReceivedTime: -1,
      timings: {
        wait: -1,
        receive: -1,
        total: -1,
      },
    };

    this.results.push(requestEntry as any);

    const start = Date.now();
    const response = await this._originalMethods[method](url, options);
    const end = Date.now();

    requestEntry.responseReceivedTime = epochTimeInSeconds();
    requestEntry.loadEndTime = requestEntry.responseReceivedTime;
    requestEntry.response = {
      // url: response.url() as any,
      status: response.status(),
      headers: await response.headers(),
      mimeType: response.headers()['content-type'] || 'x-unknown',
    };
    requestEntry.timings.wait = roundMilliSecs((end - start) / 1000);
    requestEntry.timings.receive = requestEntry.timings.wait;
    requestEntry.timings.total = requestEntry.timings.wait;

    return response;
  }

  async stop() {
    return this.results;
  }
}
