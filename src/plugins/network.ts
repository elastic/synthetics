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

export class NetworkManager {
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

    this.waterfallMap.set(requestId, {
      url,
      request,
      type,
      method,
      start: timestamp,
      isNavigationRequest,
      status: 0,
      end: 0,
      response: null,
    });
  }

  _onResponseReceived(event: Protocol.Network.responseReceivedPayload) {
    const { requestId, response } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    Object.assign(record, {
      status: response.status,
      response,
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
    const { requestId, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    record.end = timestamp;
  }

  _onLoadingFailed(event: Protocol.Network.loadingFailedPayload) {
    const { requestId, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    record.end = timestamp;
  }

  stop() {
    return [...this.waterfallMap.values()];
  }
}
