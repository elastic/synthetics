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

import { Protocol } from 'playwright-chromium/types/protocol';
import { NetworkInfo, BrowserInfo, Driver } from '../common_types';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

export class NetworkManager {
  private _browser: BrowserInfo;
  private _InflightRequestMap = new Map<string, NetworkInfo>();
  results: Array<NetworkInfo> = [];
  _currentStep: Partial<Step> = null;

  constructor(private driver: Driver) {}

  async start() {
    const { client } = this.driver;
    const { product } = await client.send('Browser.getVersion');
    const [name, version] = product.split('/');
    this._browser = { name, version };
    await client.send('Network.enable');
    /**
     * Listen for all network events
     */
    client.on(
      'Network.requestWillBeSent',
      this._onRequestWillBeSent.bind(this)
    );
    client.on(
      'Network.requestWillBeSentExtraInfo',
      this._onRequestWillBeSentExtraInfo.bind(this)
    );
    client.on('Network.dataReceived', this._onDataReceived.bind(this));
    client.on('Network.responseReceived', this._onResponseReceived.bind(this));
    client.on('Network.loadingFinished', this._onLoadingFinished.bind(this));
    client.on('Network.loadingFailed', this._onLoadingFailed.bind(this));
  }

  _findNetworkRecord(requestId: string) {
    return this._InflightRequestMap.get(requestId);
  }

  _onRequestWillBeSent(event: Protocol.Network.requestWillBeSentPayload) {
    const { url, method, postData, headers } = event.request;
    /**
     * Data URI should not show up as network requests
     */
    if (url.startsWith('data:')) {
      return;
    }
    const { requestId, timestamp, type, loaderId } = event;
    const isNavigationRequest = requestId == loaderId && type === 'Document';
    const record = this._findNetworkRecord(requestId);
    /**
     * On redirects, another `requestWillBeSent` event will be fired for the
     * same requestId. We calculate the timings for the redirect request using
     * the `redirectedResponse` from the redirected request.
     */
    if (record) {
      if (event.redirectResponse) {
        record.response.redirectURL = url;
        const response = event.redirectResponse;
        const data = Object.assign(event, {
          type: event.type,
          response,
          encodedDataLength: response.encodedDataLength,
        });
        this._onResponseReceived(data);
        this._onLoadingFinished(data);
      } else {
        /**
         * Edge case, we handle it to proceed with next navigation
         */
        this._onLoadingFailed(
          Object.assign(event, {
            type: event.type,
            errorText: 'redirectResponse data is not available',
          })
        );
      }
      const redirectedRecord = this._findNetworkRecord(requestId);
      /**
       * Rewrite the map with new redirect id to not reset
       * the redirect request with original request
       */
      this._InflightRequestMap.delete(requestId);
      this._InflightRequestMap.set(
        `redirect:${timestamp}:${requestId}`,
        redirectedRecord
      );
    }

    this._InflightRequestMap.set(requestId, {
      browser: this._browser,
      step: this._currentStep,
      timestamp: getTimestamp(),
      url,
      type,
      request: {
        url,
        method,
        headers,
        bytes: postData?.length || 0,
      },
      response: {
        status: -1,
        mimeType: 'x-unknown',
        headers: {},
        timing: null,
      },
      isNavigationRequest,
      requestSentTime: timestamp,
      responseReceivedTime: -1,
      loadEndTime: -1,
      resourceSize: 0,
      transferSize: 0,
      timings: null,
    });
  }

  _onRequestWillBeSentExtraInfo(
    event: Protocol.Network.requestWillBeSentExtraInfoPayload
  ) {
    const { requestId, headers } = event;
    const record = this._findNetworkRecord(requestId);
    if (!record) {
      return;
    }
    /**
     * Enhance request headers with additional information
     */
    record.request.headers = {
      ...record.request.headers,
      ...headers,
    };
    record.request.referrer = record.request.headers?.Referer;
  }

  _onDataReceived(event: Protocol.Network.dataReceivedPayload) {
    const { requestId, dataLength, encodedDataLength } = event;
    const record = this._findNetworkRecord(requestId);
    if (!record) {
      return;
    }
    record.resourceSize += dataLength;
    if (encodedDataLength >= 0) record.transferSize += encodedDataLength;
  }

  _onResponseReceived(event: Protocol.Network.responseReceivedPayload) {
    const { requestId, response, timestamp } = event;
    const record = this._findNetworkRecord(requestId);
    if (!record) {
      return;
    }

    record.responseReceivedTime = timestamp;
    record.transferSize = response.encodedDataLength;
    record.response = {
      url: response.url,
      status: response.status,
      protocol: response.protocol,
      statusText: response.statusText,
      headers: response.headers,
      mimeType: response.mimeType,
      remoteIPAddress: response.remoteIPAddress,
      remotePort: response.remotePort,
      fromServiceWorker: response.fromServiceWorker,
      redirectURL: record.response.redirectURL,
      timing: response.timing,
    };
    if (response.securityDetails) {
      record.response.securityDetails = {
        protocol: response.securityDetails.protocol,
        subjectName: response.securityDetails.subjectName,
        issuer: response.securityDetails.issuer,
        validFrom: response.securityDetails.validFrom,
        validTo: response.securityDetails.validTo,
      };
    }
  }

  _onLoadingFinished(event: Protocol.Network.loadingFinishedPayload) {
    const { requestId, timestamp, encodedDataLength } = event;
    this._requestCompleted(requestId, timestamp, encodedDataLength);
  }

  _onLoadingFailed(event: Protocol.Network.loadingFailedPayload) {
    const { requestId, timestamp } = event;
    this._requestCompleted(requestId, timestamp);
  }

  _requestCompleted(
    requestId: string,
    endTime: number,
    encodedDataLength?: number
  ) {
    const record = this._findNetworkRecord(requestId);
    if (!record) {
      return;
    }
    if (encodedDataLength >= 0) {
      record.transferSize = encodedDataLength;
      record.response.body = {
        bytes: encodedDataLength,
      };
    }
    record.loadEndTime = endTime;
    record.timings = calculateTimings(record);
    this.results.push(record);
    /**
     * When there is DNS failure, browsers keeps retrying requests which
     * might result in incorrect timings so we get remove them to measure only once
     */
    this._InflightRequestMap.delete(requestId);
  }

  /**
   * Account for missing response received event and also adjust the
   * response received event based on when first byte event was recorded
   */

  stop() {
    return this.results;
  }
}

function getResponseReceivedTime(
  timing: Protocol.Network.Response['timing'],
  responseReceivedTime: number
) {
  if (timing == null) {
    return responseReceivedTime;
  }
  const startTime = timing.requestTime;
  const headersReceivedTime = startTime + timing.receiveHeadersEnd / 1000;
  if (responseReceivedTime < 0 || responseReceivedTime > headersReceivedTime) {
    responseReceivedTime = headersReceivedTime;
  }
  if (startTime > responseReceivedTime) {
    responseReceivedTime = startTime;
  }
  return responseReceivedTime;
}

/**
 * The timing calculations are based on the chrome devtools frontend
 * https://github.com/ChromeDevTools/devtools-frontend/blob/7f5478d8ceb7586f23f4073ab5c2085dac1ec26a/front_end/network/RequestTimingView.js#L98-L193
 */
export function calculateTimings(record: NetworkInfo) {
  const result: NetworkInfo['timings'] = {
    blocked: -1,
    queueing: -1,
    proxy: -1,
    dns: -1,
    ssl: -1,
    connect: -1,
    send: -1,
    wait: -1,
    receive: -1,
    total: -1,
  };

  const toMilliseconds = (time: number) => (time === -1 ? -1 : time * 1000);
  const calculateDiffInMs = (
    name: keyof NetworkInfo['timings'],
    start: number,
    end: number
  ) => {
    if (start < Number.MAX_VALUE && start <= end) {
      result[name] = toMilliseconds(end - start);
    }
  };
  const firstPositive = (numbers: number[]) => {
    for (let i = 0; i < numbers.length; ++i) {
      if (numbers[i] > 0) {
        return numbers[i];
      }
    }
    return null;
  };
  /**
   * requestTime is baseline in seconds, rest of the timing data are ticks in milliseconds
   * from the requestTime, so we calculate the offset from that
   */
  const addOffsetRange = (
    name: keyof NetworkInfo['timings'],
    start: number,
    end: number
  ) => {
    if (start >= 0 && end >= 0) {
      calculateDiffInMs(name, startTime + start / 1000, startTime + end / 1000);
    }
  };
  const { requestSentTime, loadEndTime, responseReceivedTime, response } =
    record;
  const timing = response.timing;
  const actResRcvdTime = getResponseReceivedTime(timing, responseReceivedTime);
  const issueTime = requestSentTime;
  const startTime = timing == null ? -1 : timing.requestTime;
  const endTime = firstPositive([loadEndTime, actResRcvdTime]) || startTime;

  if (timing == null) {
    const start =
      issueTime !== -1 ? issueTime : startTime !== -1 ? startTime : 0;
    const middle = actResRcvdTime === -1 ? Number.MAX_VALUE : actResRcvdTime;
    const end = endTime === -1 ? Number.MAX_VALUE : endTime;
    calculateDiffInMs('total', start, end);
    calculateDiffInMs('blocked', start, middle);
    calculateDiffInMs('receive', middle, end);
    // Check if the request is blocked/stalled for the whole timeframe and
    // calculate timings appropriately for that request
    if (!isFinite(result['blocked'])) {
      result['blocked'] = result['total'];
    }
    return result;
  }
  calculateDiffInMs(
    'total',
    issueTime < startTime ? issueTime : startTime,
    endTime
  );
  if (issueTime < startTime) {
    calculateDiffInMs('queueing', issueTime, startTime);
  }
  const responseReceived = toMilliseconds(actResRcvdTime - startTime);

  if (response.fromServiceWorker) {
    addOffsetRange('blocked', 0, timing.workerStart);
    addOffsetRange('wait', timing.sendEnd, responseReceived);
  } else if (!timing.pushStart) {
    const blockingEnd =
      firstPositive([
        timing.dnsStart,
        timing.connectStart,
        timing.sendStart,
        responseReceived,
      ]) || 0;
    addOffsetRange('blocked', 0, blockingEnd);
    addOffsetRange('proxy', timing.proxyStart, timing.proxyEnd);
    addOffsetRange('dns', timing.dnsStart, timing.dnsEnd);
    addOffsetRange('connect', timing.connectStart, timing.connectEnd);
    addOffsetRange('ssl', timing.sslStart, timing.sslEnd);
    addOffsetRange('send', timing.sendStart, timing.sendEnd);
    addOffsetRange(
      'wait',
      Math.max(
        timing.sendEnd,
        timing.connectEnd,
        timing.dnsEnd,
        timing.proxyEnd,
        blockingEnd
      ),
      responseReceived
    );
  }
  calculateDiffInMs('receive', actResRcvdTime, endTime);
  return result;
}
