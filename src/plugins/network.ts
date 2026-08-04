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

import { Frame, Page, Request, Response } from 'playwright-core';
import { NetworkInfo, BrowserInfo, Driver } from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';
import { calcTotalTime, getResourceTimings } from '../network-timings';

/**
 * Kibana UI expects the requestStartTime and loadEndTime to be baseline
 * in seconds as they have the logic to convert it to milliseconds before
 * using for offset calculation
 */
function epochTimeInSeconds() {
  return getTimestamp() / 1e6;
}

/**
 * Used as a key in each Network Request to identify the
 * associated request across distinct lifecycle events
 */
export const NETWORK_ENTRY_SUMBOL = Symbol.for('NetworkEntry');

type RequestWithEntry = Request & {
  NETWORK_ENTRY_SUMBOL?: symbol;
};

export class NetworkManager {
  private _browser: BrowserInfo;
  private _barrierPromises = new Set<Promise<void>>();
  results: Array<NetworkInfo> = [];
  _currentStep: Partial<Step> = null;

  constructor(private driver: Driver) {}

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
    const { client, context } = this.driver;
    const { product } = await client.send('Browser.getVersion');
    const [name, version] = product.split('/');
    this._browser = { name, version };
    /**
     * Listen for all network events from PW context
     */
    context.on('request', this._onRequest.bind(this));
    context.on('response', this._onResponse.bind(this));
    context.on('requestfinished', this._onRequestCompleted.bind(this));
    context.on('requestfailed', this._onRequestCompleted.bind(this));
  }

  private _findNetworkEntry(
    request: RequestWithEntry
  ): NetworkInfo | undefined {
    return request[NETWORK_ENTRY_SUMBOL];
  }

  private _onRequest(request: Request) {
    const url = request.url();
    /**
     * Data URI should not show up as network requests
     */
    if (url.startsWith('data:')) {
      return;
    }

    const timestamp = getTimestamp();
    const networkEntry: NetworkInfo = {
      browser: this._browser,
      step: this._currentStep,
      timestamp,
      url,
      type: request.resourceType(),
      request: {
        url,
        method: request.method(),
        headers: request.headers(),
        body: {
          bytes: request.postDataBuffer()?.length || 0,
        },
      },
      response: {
        status: -1,
        headers: {},
        mimeType: 'x-unknown',
        redirectURL: '',
      },
      isNavigationRequest: request.isNavigationRequest(),
      requestSentTime: epochTimeInSeconds(),
      loadEndTime: -1,
      responseReceivedTime: -1,
      resourceSize: 0,
      transferSize: 0,
      timings: {
        blocked: -1,
        dns: -1,
        ssl: -1,
        connect: -1,
        send: -1,
        wait: -1,
        receive: -1,
        total: -1,
      },
    };

    if (request.redirectedFrom()) {
      const fromEntry = this._findNetworkEntry(request.redirectedFrom());
      if (fromEntry) fromEntry.response.redirectURL = request.url();
    }

    request[NETWORK_ENTRY_SUMBOL] = networkEntry;
    this.results.push(networkEntry);
  }

  private async _onResponse(response: Response) {
    const request = response.request();
    const networkEntry = this._findNetworkEntry(request);
    if (!networkEntry) return;

    networkEntry.responseReceivedTime = epochTimeInSeconds();
    networkEntry.response = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: {},
      mimeType: 'x-unknown',
      redirectURL: networkEntry.response.redirectURL,
    };

    // Gather all resource timing information up until the
    // TTFB(Time to first byte) is received
    const timing = request.timing();
    networkEntry.timings = getResourceTimings(timing);
    networkEntry.timings.total = calcTotalTime(networkEntry, timing);

    const frame = this._nullableFrameBarrier(request);
    const page = frame?.page();
    this._addBarrier(
      page,
      request.allHeaders().then(reqHeaders => {
        networkEntry.request.headers = reqHeaders;
        networkEntry.request.referrer = reqHeaders?.referer;
      })
    );
    this._addBarrier(
      page,
      response.allHeaders().then(resHeaders => {
        networkEntry.response.headers = resHeaders;

        const contentType = resHeaders['content-type'];
        if (contentType)
          networkEntry.response.mimeType = contentType.split(';')[0];
      })
    );
    this._addBarrier(
      page,
      response.serverAddr().then(server => {
        networkEntry.response.remoteIPAddress = server?.ipAddress;
        networkEntry.response.remotePort = server?.port;
      })
    );
    this._addBarrier(
      page,
      response.securityDetails().then(details => {
        if (details) networkEntry.response.securityDetails = details;
      })
    );
  }

  private async _onRequestCompleted(request: Request) {
    const networkEntry = this._findNetworkEntry(request);
    if (!networkEntry) return;

    networkEntry.loadEndTime = epochTimeInSeconds();
    // responseEnd is fired after the last byte of the response is received.
    const timing = request.timing();
    networkEntry.timings = getResourceTimings(timing);
    networkEntry.timings.total = calcTotalTime(networkEntry, timing);

    // For aborted/failed requests sizes will not be present
    if (timing.startTime <= 0) {
      return;
    }

    const frame = this._nullableFrameBarrier(request);
    const page = frame?.page();
    this._addBarrier(
      page,
      request.sizes().then(sizes => {
        networkEntry.request.bytes =
          sizes.requestHeadersSize + sizes.requestBodySize;
        networkEntry.request.body = {
          bytes: sizes.requestBodySize,
        };
        const transferSize = sizes.responseHeadersSize + sizes.responseBodySize;
        networkEntry.transferSize = transferSize;
        networkEntry.response.bytes = transferSize;
        networkEntry.response.body = {
          bytes: sizes.responseBodySize,
        };
      })
    );
  }

  async stop() {
    /**
     * Waiting for all network events is error prone and might hang the tests
     * from getting closed forever when there are upstream bugs in browsers or
     * Playwright. So we log and drop these events once the test run is completed
     */
    if (this._barrierPromises.size > 0) {
      log(`Plugins: dropping ${this._barrierPromises.size} network events`);
    }
    const context = this.driver.context;
    context.off('request', this._onRequest.bind(this));
    context.off('response', this._onResponse.bind(this));
    context.off('requestfinished', this._onRequestCompleted.bind(this));
    context.off('requestfailed', this._onRequestCompleted.bind(this));
    this._barrierPromises.clear();
    log(`Plugins: stopped collecting network events`);
    return this.results;
  }
}
