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

import { CDPSession } from 'playwright-chromium';
import { Protocol } from 'playwright-chromium/types/protocol';
import { NetworkInfo } from '../common_types';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

export class NetworkManager {
  _currentStep: Partial<Step> = null;
  waterfallMap = new Map<string, NetworkInfo>();

  async start(client: CDPSession) {
    await client.send('Network.enable');
    /**
     * Listen for all network events
     */
    client.on(
      'Network.requestWillBeSent',
      this._onRequestWillBeSent.bind(this)
    );
    client.on('Network.responseReceived', this._onResponseReceived.bind(this));
    client.on('Network.loadingFinished', this._onLoadingFinished.bind(this));
    client.on('Network.loadingFailed', this._onLoadingFailed.bind(this));
  }

  _onRequestWillBeSent(event: Protocol.Network.requestWillBeSentPayload) {
    const { requestId, request, timestamp, type, loaderId } = event;
    const { url, method } = request;
    const isNavigationRequest = requestId == loaderId && type === 'Document';
    const record = this.waterfallMap.get(requestId);
    /**
     * On redirects, another `requestWillBeSent` event will be fired for the
     * same requestId. We calculate the timings for the redirect request using
     * the `redirectedResponse` from the redirected request.
     */
    if (record) {
      if (event.redirectResponse) {
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
      const redirectedRecord = this.waterfallMap.get(requestId);
      /**
       * Rewrite the map with new redirect id to not reset
       * the redirect request with original request
       */
      this.waterfallMap.delete(requestId);
      this.waterfallMap.set(
        `redirect:${timestamp}:${requestId}`,
        redirectedRecord
      );
    }

    this.waterfallMap.set(requestId, {
      step: this._currentStep,
      timestamp: getTimestamp(),
      url,
      request,
      type,
      method,
      requestSentTime: timestamp,
      isNavigationRequest,
      status: 0,
      loadEndTime: -1,
      responseReceivedTime: -1,
      response: null,
      timings: null,
    });
  }

  _onResponseReceived(event: Protocol.Network.responseReceivedPayload) {
    const { requestId, response, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    Object.assign(record, {
      status: response.status,
      response,
      responseReceivedTime: timestamp,
    });
    /**
     * Enhance request headers with additional information
     */
    if (response.requestHeaders) {
      record.request.headers = {
        ...record.request.headers,
        ...response.requestHeaders,
      };
    }
  }

  _onLoadingFinished(event: Protocol.Network.loadingFinishedPayload) {
    const { requestId, timestamp, encodedDataLength } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    if (record.response) {
      record.response.encodedDataLength = encodedDataLength;
    }
    record.loadEndTime = timestamp;
    record.timings = this.calculateTimings(record);
  }

  _onLoadingFailed(event: Protocol.Network.loadingFailedPayload) {
    const { requestId, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    record.loadEndTime = timestamp;
    record.timings = this.calculateTimings(record);
  }
  /**
   * Account for missing response received event and also adjust the
   * response received event based on when first byte event was recorded
   */
  getResponseReceivedTime(
    timing: Protocol.Network.Response['timing'],
    responseReceivedTime: number
  ) {
    if (timing == null) {
      return responseReceivedTime;
    }
    const startTime = timing.requestTime;
    const headersReceivedTime = startTime + timing.receiveHeadersEnd / 1000;
    if (
      responseReceivedTime < 0 ||
      responseReceivedTime > headersReceivedTime
    ) {
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
  calculateTimings(record: NetworkInfo) {
    const {
      response,
      requestSentTime,
      loadEndTime,
      responseReceivedTime,
    } = record;
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
    if (response == null) {
      return result;
    }

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
        calculateDiffInMs(
          name,
          startTime + start / 1000,
          startTime + end / 1000
        );
      }
    };
    const timing = response.timing;
    const actResRcvdTime = this.getResponseReceivedTime(
      timing,
      responseReceivedTime
    );
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

  stop() {
    return [...this.waterfallMap.values()];
  }
}
