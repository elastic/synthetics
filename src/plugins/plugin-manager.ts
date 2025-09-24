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

import { PluginOutput, Driver, RunOptions, StepResult } from '../common_types';
import {
  BrowserConsole,
  NetworkManager,
  PerformanceManager,
  Tracing,
  TraceOptions,
} from './';
import { Step } from '../dsl';
import { AttachmentOptions, AttachmentsManager } from './attachments';
import { Gatherer } from '../core/gatherer';

type PluginType =
  | 'network'
  | 'trace'
  | 'performance'
  | 'browserconsole'
  | 'attachments';
type Plugin =
  | NetworkManager
  | Tracing
  | PerformanceManager
  | BrowserConsole
  | AttachmentsManager;
type PluginOptions = TraceOptions & AttachmentOptions;

export class PluginManager {
  protected plugins = new Map<PluginType, Plugin>();
  public PLUGIN_TYPES: Array<PluginType> = [
    'network',
    'trace',
    'performance',
    'browserconsole',
    'attachments',
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
      case 'attachments':
        instance = new AttachmentsManager(this.driver, options);
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

  async onStep(step: Step, options: RunOptions) {
    const { filmstrips, trace } = options;

    const traceEnabled = trace || filmstrips;
    traceEnabled && (await Gatherer.pluginManager.start('trace'));

    (this.get('browserconsole') as BrowserConsole)._currentStep = step;
    (this.get('network') as NetworkManager)._currentStep = step;
  }

  async onJourneyStart() {
    await (this.get('attachments') as AttachmentsManager).setup();
  }

  async onStepEnd(step: Step, options: RunOptions, data: StepResult) {
    const { metrics, filmstrips, trace } = options;
    const traceEnabled = trace || filmstrips;

    /**
     * Collect all step level metrics and trace events
     */
    if (metrics) {
      data.pagemetrics = await (
        Gatherer.pluginManager.get('performance') as PerformanceManager
      ).getMetrics();
    }
    if (traceEnabled) {
      const traceOutput = await Gatherer.pluginManager.stop('trace');
      Object.assign(data, traceOutput);
    }

    await (this.get('attachments') as AttachmentsManager).recordScreenshots(
      step
    );
  }

  async onJourneyEnd() {
    await (this.get('attachments') as AttachmentsManager)?.clear();
  }

  async output() {
    const data: PluginOutput = {};
    for (const [, plugin] of this.plugins) {
      if (plugin instanceof NetworkManager) {
        data.networkinfo = await plugin.stop();
      } else if (plugin instanceof BrowserConsole) {
        data.browserconsole = plugin.stop();
      } else if (plugin instanceof AttachmentsManager) {
        data.attachments = plugin.stop();
      }
    }
    return data;
  }
}
