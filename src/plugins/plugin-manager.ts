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

import { PluginOutput } from '../common_types';
import {
  BrowserConsole,
  NetworkManager,
  PerformanceManager,
  Tracing,
  TraceOptions,
} from './';
import { Driver } from '../core/gatherer';
import { Step } from '../dsl';

type PluginType = 'network' | 'trace' | 'performance' | 'browserconsole';
type Plugin = NetworkManager | Tracing | PerformanceManager | BrowserConsole;
type PluginOptions = TraceOptions;

export class PluginManager {
  protected plugins = new Map<string, Plugin>();

  constructor(private driver: Driver) {}

  async start(type: PluginType, options?: PluginOptions) {
    let instance: Plugin;
    switch (type) {
      case 'network':
        instance = new NetworkManager();
        await instance.start(this.driver.client);
        break;
      case 'trace':
        instance = new Tracing(options);
        await instance.start(this.driver.client);
        break;
      case 'performance':
        instance = new PerformanceManager(this.driver.client);
        instance.start();
        break;
      case 'browserconsole':
        instance = new BrowserConsole(this.driver.page);
        instance.start();
        break;
    }

    this.plugins.set(instance.constructor.name, instance);
    return instance;
  }

  get<T extends Plugin>(Type: new (...args: any[]) => T): T {
    return this.plugins.get(Type.name) as T;
  }

  onStep(step: Step) {
    this.get(BrowserConsole) && (this.get(BrowserConsole)._currentStep = step);
    this.get(NetworkManager) && (this.get(NetworkManager)._currentStep = step);
  }

  async output(): Promise<PluginOutput> {
    const data: PluginOutput = {};
    try {
      for (const [, plugin] of this.plugins) {
        if (plugin instanceof NetworkManager) {
          data.networkinfo = plugin.stop();
        } else if (plugin instanceof Tracing) {
          const result = await plugin.stop(this.driver.client);
          Object.assign(data, { ...result });
        } else if (plugin instanceof BrowserConsole) {
          data.browserconsole = plugin.stop();
        }
      }
    } catch (e) {
      console.error('Error capturing data', e.message);
    }
    return data;
  }
}
