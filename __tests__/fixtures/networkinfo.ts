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

export const NETWORK_INFO: Array<Partial<NetworkInfo>> = [
  {
    browser: { name: 'HeadlessChrome', version: '90.0.4392.0' },
    step: {
      name: 'go to app',
      index: 1,
    },
    timestamp: 1612482095137858.2,
    url: 'https://vigneshh.in/',
    request: {
      url: 'https://vigneshh.in/',
      method: 'GET',
      headers: {
        'upgrade-insecure-requests': '1',
        ':method': 'GET',
        ':path': '/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/90.0.4392.0 Safari/537.36',
        'accept-encoding': 'gzip, deflate, br',
      },
    },
    type: 'Document',
    method: 'GET',
    requestSentTime: 2355505.10179,
    isNavigationRequest: true,
    status: 200,
    loadEndTime: 2355505.448326,
    responseReceivedTime: 2355505.4514,
    response: {
      url: 'https://vigneshh.in/',
      headers: {},
      statusCode: 200,
      statusText: '',
      mimeType: 'text/html',
      remoteIPAddress: '[2606:4700:3035::ac43:83e0]',
      remotePort: 443,
      securityDetails: {
        protocol: 'TLS 1.3',
        subjectName: 'sni.cloudflaressl.com',
        issuer: 'Cloudflare Inc ECC CA-3',
        validFrom: 1595980800,
        validTo: 1627560000,
      },
    },
    transferSize: 3392,
    resourceSize: 7634,
    timings: {
      blocked: 2.080999780446291,
      queueing: 2.145999576896429,
      dns: 45.81400007009506,
      ssl: 61.003000009804964,
      connect: 78.5130001604557,
      send: 0.5449997261166573,
      wait: 212.02100021764636,
      receive: 3.9220000617206097,
      total: 346.5359997935593,
    },
  },
  {
    browser: { name: 'HeadlessChrome', version: '90.0.4392.0' },
    step: {
      name: 'go to app',
      index: 1,
    },
    timestamp: 1612482095517516,
    url: 'https://vigneshh.in/static/main.js',
    request: {
      url: 'https://vigneshh.in/static/main.js',
      method: 'GET',
      referrer: 'https://vigneshh.in/',
      headers: {
        referer: 'https://vigneshh.in/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/90.0.4392.0 Safari/537.36',
      },
    },
    type: 'Script',
    method: 'GET',
    requestSentTime: 2355505.472502,
    isNavigationRequest: false,
    status: 200,
    loadEndTime: 2355505.589043,
    responseReceivedTime: 2355505.603987,
    response: {
      url: 'https://vigneshh.in/static/main.js',
      statusCode: 200,
      statusText: '',
      headers: {},
      mimeType: 'application/javascript',
      remoteIPAddress: '[2606:4700:3035::ac43:83e0]',
      remotePort: 443,
      securityDetails: {
        protocol: 'TLS 1.3',
        subjectName: 'sni.cloudflaressl.com',
        issuer: 'Cloudflare Inc ECC CA-3',
        validFrom: 1595980800,
        validTo: 1627560000,
      },
    },
    timings: {
      blocked: 1.058999914675951,
      queueing: 46.335999853909016,
      dns: -1,
      ssl: -1,
      connect: -1,
      send: 0.2100002020597458,
      wait: 68.73499974608421,
      receive: 0.2009999006986618,
      total: 116.54099961742759,
    },
  },
  {
    browser: { name: 'HeadlessChrome', version: '90.0.4392.0' },
    timestamp: 1612482095713278.2,
    url: 'https://www.google-analytics.com/',
    request: {
      url: 'https://www.google-analytics.com/',
      method: 'POST',
      referrer: 'https://vigneshh.in/',
      headers: {
        referer: 'https://vigneshh.in/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/90.0.4392.0 Safari/537.36',
        'content-type': 'text/plain',
      },
    },
    type: 'XHR',
    method: 'POST',
    requestSentTime: 2355505.677688,
    isNavigationRequest: false,
    status: 0,
    loadEndTime: -1,
    responseReceivedTime: -1,
    response: undefined,
    timings: null,
  },
];
