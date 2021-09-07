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

import { PluginOutput, Driver } from '../common_types';
import {
  BrowserConsole,
  NetworkManager,
  PerformanceManager,
  Tracing,
  TraceOptions,
} from './';
import { Step } from '../dsl';

type PluginType = 'network' | 'trace' | 'performance' | 'browserconsole';
type Plugin = NetworkManager | Tracing | PerformanceManager | BrowserConsole;
type PluginOptions = TraceOptions;

export class PluginManager {
  protected plugins = new Map<PluginType, Plugin>();
  public PLUGIN_TYPES: Array<PluginType> = [
    'network',
    'trace',
    'performance',
    'browserconsole',
  ];
  constructor(private driver: Driver) {}

  register(type: PluginType, options: PluginOptions) {
    let instance: Plugin;
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

  onStep(step: Step) {
    (this.get('browserconsole') as BrowserConsole)._currentStep = step;
    (this.get('network') as NetworkManager)._currentStep = step;
  }

  output() {
    const data: PluginOutput = {};
    for (const [, plugin] of this.plugins) {
      if (plugin instanceof NetworkManager) {
        data.networkinfo = plugin.stop();
      } else if (plugin instanceof BrowserConsole) {
        data.browserconsole = plugin.stop();
      }
    }
    return data;
  }
}
