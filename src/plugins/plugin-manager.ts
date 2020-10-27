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

import { NetworkManager } from './network';
import { Tracing, filterFilmstrips } from './tracing';
import { CDPSession } from 'playwright';
import { NetworkInfo, FilmStrip } from '../common_types';
import { PerformanceManager } from './performance';

type PluginType = 'network' | 'trace' | 'performance';

type PluginOutput = {
  filmstrips?: Array<FilmStrip>;
  networkinfo?: Array<NetworkInfo>;
};

type Plugin = NetworkManager | Tracing | PerformanceManager;

export class PluginManager {
  protected plugins = new Map<string, Plugin>();

  constructor(private session: CDPSession) {}

  async start(type: PluginType) {
    let instance: Plugin;
    switch (type) {
      case 'network':
        instance = new NetworkManager();
        await instance.start(this.session);
        break;
      case 'trace':
        instance = new Tracing();
        await instance.start(this.session);
        break;
      case 'performance':
        instance = new PerformanceManager(this.session);
        instance.start();
        break;
    }

    this.plugins.set(instance.constructor.name, instance);
    return instance;
  }

  get<T extends Plugin>(Type: new (...args: any[]) => T): T {
    return this.plugins.get(Type.name) as T;
  }

  async output(): Promise<PluginOutput> {
    const data = {
      filmstrips: [],
      networkinfo: [],
    };
    for (const [, plugin] of this.plugins) {
      if (plugin instanceof NetworkManager) {
        data.networkinfo = plugin.stop();
      } else if (plugin instanceof Tracing) {
        const result = await plugin.stop(this.session);
        data.filmstrips = filterFilmstrips(result);
      }
    }
    return data;
  }
}
