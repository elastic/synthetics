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

import { NetworkInfo } from '../../src/common_types';

export const NETWORK_INFO: Array<NetworkInfo> = [
  {
    browser: { name: 'HeadlessChrome', version: '94.0.4595.0' },
    step: null,
    timestamp: 1646782451347652.5,
    url: 'http://localhost:56899/index',
    type: 'Document',
    request: {
      url: 'http://localhost:56899/index',
      method: 'GET',
      headers: {
        'Upgrade-Insecure-Requests': '1',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/94.0.4595.0 Safari/537.36 Elastic/Synthetics',
        Host: 'localhost:56899',
        Connection: 'keep-alive',
      },
      bytes: 0,
      referrer: undefined,
    },
    response: {
      url: 'http://localhost:56899/index',
      status: 200,
      protocol: 'http/1.1',
      statusText: 'OK',
      headers: {
        'content-type': 'text/html',
        Date: 'Tue, 08 Mar 2022 23:34:11 GMT',
        Connection: 'keep-alive',
        'Keep-Alive': 'timeout=5',
        'Content-Length': '46',
      },
      mimeType: 'text/html',
      remoteIPAddress: '[::1]',
      remotePort: 56899,
      fromServiceWorker: false,
      redirectURL: undefined,
      timing: {
        requestTime: 300869.367875,
        proxyStart: -1,
        proxyEnd: -1,
        dnsStart: 0.25,
        dnsEnd: 0.25,
        connectStart: 0.25,
        connectEnd: 0.5,
        sslStart: -1,
        sslEnd: -1,
        workerStart: -1,
        workerReady: -1,
        workerFetchStart: -1,
        workerRespondWithSettled: -1,
        sendStart: 0.5,
        sendEnd: 0.5,
        pushStart: 0,
        pushEnd: 0,
        receiveHeadersEnd: 5.125,
      },
      body: { bytes: 194 },
    },
    isNavigationRequest: true,
    requestSentTime: 300869.36725,
    responseReceivedTime: 300869.3735,
    loadEndTime: 300869.373125,
    resourceSize: 46,
    transferSize: 194,
    timings: {
      blocked: 0.24999998277053237,
      queueing: 0.6249999860301614,
      proxy: -1,
      dns: 0,
      ssl: -1,
      connect: 0.2500000409781933,
      send: 0,
      wait: 4.625000001396984,
      receive: 0.12499996228143573,
      total: 5.874999973457307,
    },
  },
  {
    browser: { name: 'HeadlessChrome', version: '94.0.4595.0' },
    step: null,
    timestamp: 1646782451408470,
    url: 'http://localhost:56899/delay100',
    type: 'Script',
    request: {
      url: 'http://localhost:56899/delay100',
      method: 'GET',
      headers: {
        Referer: 'http://localhost:56899/index',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/94.0.4595.0 Safari/537.36 Elastic/Synthetics',
        Host: 'localhost:56899',
        Connection: 'keep-alive',
      },
      bytes: 0,
      referrer: undefined,
    },
    response: {
      status: -1,
      mimeType: 'x-unknown',
      headers: {},
      timing: null,
    },
    isNavigationRequest: false,
    requestSentTime: 300869.377,
    responseReceivedTime: -1,
    loadEndTime: 300869.45675,
    resourceSize: 0,
    transferSize: 0,
    timings: {
      blocked: 79.75000003352761,
      queueing: -1,
      proxy: -1,
      dns: -1,
      ssl: -1,
      connect: -1,
      send: -1,
      wait: -1,
      receive: -1,
      total: 79.75000003352761,
    },
  },
];
