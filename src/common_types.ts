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

import {
  BrowserContextOptions,
  LaunchOptions,
  CDPSession,
  ChromiumBrowser,
  ChromiumBrowserContext,
  Page,
} from 'playwright-chromium';
import { Protocol } from 'playwright-chromium/types/protocol';
import { Step } from './dsl';
import { reporters } from './reporters';

export type VoidCallback = () => void;
export type Params = Record<string, any>;
export type NetworkConditions = {
  offline: boolean;
  downloadThroughput: number;
  uploadThroughput: number;
  latency: number;
};
export type HooksArgs = {
  env: string;
  params: Params;
};
export type HooksCallback = (args: HooksArgs) => void;
export type StatusValue = 'succeeded' | 'failed' | 'skipped';
export type Reporters = keyof typeof reporters;

export type Driver = {
  browser: ChromiumBrowser;
  context: ChromiumBrowserContext;
  page: Page;
  client: CDPSession;
};

export type TraceOutput = {
  name: string;
  type: string;
  start: MetricDuration;
  duration?: MetricDuration;
  score?: number;
};

type MetricDuration = {
  us: number;
};

export type PerfMetrics = {
  fcp: MetricDuration;
  lcp: MetricDuration;
  dcl: MetricDuration;
  load: MetricDuration;
  cls: number;
};

export type Filmstrip = {
  start: MetricDuration;
  blob: string;
  mime: string;
};

export type DefaultPluginOutput = {
  step?: Partial<Step>;
  timestamp: number;
};

export type BrowserInfo = {
  name: string;
  version: string;
};

export type Screenshot = {
  timestamp: number;
  step: Step;
  data: string;
};

export type SecurityDetails = {
  issuer?: string;
  protocol?: string;
  subjectName?: string;
  validFrom?: number;
  validTo?: number;
};

export type Request = {
  method: string;
  url: string;
  headers: Record<string, string>;
  // Total size in bytes of the request (body and headers)
  bytes?: number;
  body?: {
    // Size in bytes of the request body
    bytes: number;
  };
  referrer?: string;
};

export type Response = {
  url?: string;
  protocol?: string;
  status: number;
  statusText?: string;
  mimeType: string;
  httpVersion?: string;
  headers: Record<string, string>;
  // Total size in bytes of the response (body and headers)
  bytes?: number;
  body?: {
    // Size in bytes of the response body
    bytes: number;
  };
  transferSize?: number;
  redirectURL?: string;
  securityDetails?: SecurityDetails;
  remoteIPAddress?: string;
  remotePort?: number;
  fromServiceWorker?: boolean;
  timing?: Protocol.Network.ResourceTiming;
};

export type NetworkInfo = {
  url: string;
  browser: BrowserInfo;
  type: string;
  request: Request;
  response?: Response;
  isNavigationRequest: boolean;
  requestSentTime: number;
  loadEndTime: number;
  responseReceivedTime: number;
  resourceSize: number;
  transferSize: number;
  timings?: {
    blocked: number;
    queueing: number;
    dns: number;
    ssl: number;
    proxy: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    total: number;
  };
} & DefaultPluginOutput;

export type BrowserMessage = {
  text: string;
  type: string;
  error?: Error;
} & DefaultPluginOutput;

export type PluginOutput = {
  filmstrips?: Array<Filmstrip>;
  networkinfo?: Array<NetworkInfo>;
  browserconsole?: Array<BrowserMessage>;
  traces?: Array<TraceOutput>;
  metrics?: PerfMetrics;
};

export type ScreenshotOptions = 'on' | 'off' | 'only-on-failure';

export type CliArgs = {
  capability?: Array<string>;
  config?: string;
  outfd?: number;
  headless?: boolean;
  screenshots?: ScreenshotOptions;
  ssblocks?: boolean;
  metrics?: boolean;
  filmstrips?: boolean;
  trace?: boolean;
  dryRun?: boolean;
  network?: boolean;
  pauseOnError?: boolean;
  quietExitCode?: boolean;
  reporter?: Reporters;
  wsEndpoint?: string;
  sandbox?: boolean;
  pattern?: string;
  inline: boolean;
  match?: string;
  tags?: Array<string>;
  require: Array<string>;
  debug?: boolean;
  ignoreHttpsErrors?: boolean;
  params?: Params;
  throttling?: boolean | string;
  playwrightOptions?: LaunchOptions & BrowserContextOptions;
  richEvents?: boolean;
};

export type PlaywrightOptions = LaunchOptions & BrowserContextOptions;
export type SyntheticsConfig = {
  params?: Params;
  playwrightOptions?: PlaywrightOptions;
};
