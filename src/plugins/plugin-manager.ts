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
  PluginOutput,
  Driver,
  APIDriver,
  NetworkInfo,
  ApmOptions,
} from '../common_types';
import {
  Apm,
  BrowserConsole,
  NetworkManager,
  PerformanceManager,
  Tracing,
  TraceOptions,
} from './';
import { Step } from '../dsl';
import { APINetworkManager } from './api-network';

type PluginType =
  | 'network'
  | 'trace'
  | 'performance'
  | 'browserconsole'
  | 'apm';

// Shared shape for `NetworkManager` and `APINetworkManager` so the manager
// stays agnostic to the driver type.
export type NetworkPlugin = {
  results: Array<NetworkInfo>;
  _currentStep: Partial<Step> | null;
  start(): Promise<void>;
  stop(): Promise<Array<NetworkInfo>>;
};

type Plugin =
  | NetworkManager
  | Tracing
  | PerformanceManager
  | BrowserConsole
  | APINetworkManager
  | Apm;
type PluginOptions = TraceOptions & {
  apm?: ApmOptions;
};

function isBrowserDriver(driver: Driver | APIDriver): driver is Driver {
  return 'context' in driver;
}

function isNetworkPlugin(
  plugin: Plugin
): plugin is NetworkManager | APINetworkManager {
  return (
    plugin instanceof NetworkManager || plugin instanceof APINetworkManager
  );
}

export class PluginManager {
  protected plugins = new Map<PluginType, Plugin>();
  public PLUGIN_TYPES: Array<PluginType> = [
    'network',
    'trace',
    'performance',
    'browserconsole',
    'apm',
  ];
  constructor(private driver: Driver | APIDriver) {}

  register(type: PluginType, options: PluginOptions) {
    let instance: Plugin;

    if (isBrowserDriver(this.driver)) {
      switch (type) {
        case 'network':
          instance = new NetworkManager(this.driver);
          break;
        case 'trace':
          instance = new Tracing(this.driver, options);
          break;
        case 'performance':
          instance = new PerformanceManager(this.driver);
          break;
        case 'browserconsole':
          instance = new BrowserConsole(this.driver);
          break;
        case 'apm':
          instance = new Apm(this.driver, options.apm);
          break;
      }
    } else {
      // API journeys only record network; skip browser-only plugins.
      if (type === 'network') {
        instance = new APINetworkManager(this.driver);
      }
    }
    instance && this.plugins.set(type, instance);
    return instance;
  }

  registerAll(options: PluginOptions) {
    for (const type of this.PLUGIN_TYPES) {
      this.register(type, options);
    }
  }

  unregisterAll() {
    for (const type of this.PLUGIN_TYPES) {
      this.plugins.delete(type);
    }
  }

  async stop(type: PluginType) {
    const instance = this.plugins.get(type);
    if (instance) {
      return await instance.stop();
    }
    return {};
  }

  async start(type: PluginType) {
    const instance = this.plugins.get(type);
    instance && (await instance.start());
    return instance;
  }

  get(type: PluginType) {
    return this.plugins.get(type);
  }

  // Propagate the active step to step-scoped plugins (no-op when absent).
  onStep(step: Step) {
    const browserConsole = this.plugins.get('browserconsole') as
      | BrowserConsole
      | undefined;
    if (browserConsole) browserConsole._currentStep = step;
    const network = this.plugins.get('network');
    if (network && isNetworkPlugin(network)) network._currentStep = step;
  }

  async output() {
    const data: PluginOutput = {};
    for (const [, plugin] of this.plugins) {
      if (isNetworkPlugin(plugin)) {
        data.networkinfo = await plugin.stop();
      } else if (plugin instanceof BrowserConsole) {
        data.browserconsole = plugin.stop();
      }
    }
    return data;
  }
}
