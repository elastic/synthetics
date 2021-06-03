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
import { Step } from './dsl';
import { reporters } from './reporters';

export type VoidCallback = () => void;
export type Params = Record<string, unknown>;
export type HooksArgs = {
  env: string;
  params: Params;
};
export type HooksCallback = (args: HooksArgs) => void;
export type StatusValue = 'succeeded' | 'failed' | 'skipped';
export type Reporters = keyof typeof reporters;

export type TraceOutput = {
  name?: string;
  start: number;
  end?: number;
};

export type UserTiming = TraceOutput & {
  name: string;
  type: string;
  duration?: number;
};

export type Filmstrip = TraceOutput & {
  blob: string;
  mime: string;
};

export type LayoutShift = {
  exists: boolean;
  score: number;
  name: string;
  start?: number;
};

export type DefaultPluginOutput = {
  step?: Partial<Step>;
  timestamp: number;
};

export type BrowserInfo = {
  name: string;
  version: string;
};

export type NetworkInfo = {
  url: string;
  browser: BrowserInfo;
  method: string;
  type: string;
  request: Protocol.Network.Request;
  response?: Protocol.Network.Response;
  isNavigationRequest: boolean;
  requestSentTime: number;
  loadEndTime: number;
  responseReceivedTime: number;
  status: number;
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
} & DefaultPluginOutput;

export type PluginOutput = {
  filmstrips?: Array<Filmstrip>;
  userTiming?: Array<UserTiming>;
  experience?: Array<UserTiming>;
  networkinfo?: Array<NetworkInfo>;
  browserconsole?: Array<BrowserMessage>;
  layoutShift?: LayoutShift;
};

export type CliArgs = {
  config?: string;
  environment?: string;
  outfd?: number;
  headless?: boolean;
  screenshots?: boolean;
  ssblocks?: boolean;
  metrics?: boolean;
  filmstrips?: boolean;
  trace?: boolean;
  dryRun?: boolean;
  journeyName?: string;
  network?: boolean;
  pauseOnError?: boolean;
  reporter?: Reporters;
  wsEndpoint?: string;
  sandbox?: boolean;
  json?: boolean;
  pattern?: string;
  inline: boolean;
  require: string[];
  debug?: boolean;
  suiteParams?: string;
  richEvents?: true;
};
