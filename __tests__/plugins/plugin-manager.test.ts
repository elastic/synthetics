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

import { NetworkManager } from '../../src/plugins/network';
import { APINetworkManager } from '../../src/plugins/api-network';
import { PluginManager } from '../../src/plugins';

jest.mock('../../src/plugins/network');
jest.mock('../../src/plugins/api-network');

describe('plugin manager (browser driver)', () => {
  const pluginManager = new PluginManager({ context: {} } as any);

  it('register plugin by type', async () => {
    await pluginManager.register('network', {});
    const instance = pluginManager.get('network');
    expect(instance).toBeInstanceOf(NetworkManager);
  });

  it('register and unregister all Plugins', async () => {
    pluginManager.registerAll({});
    expect(pluginManager.get('network')).toBeDefined();
    pluginManager.unregisterAll();
    expect(pluginManager.get('network')).not.toBeDefined();
  });

  it('start plugin with given type', async () => {
    await pluginManager.register('network', {}).start();
    const instance = pluginManager.get('network');
    expect(instance?.start).toHaveBeenCalled();
  });

  it('stop plugin by type', async () => {
    await pluginManager.register('network', {}).start();
    const instance = pluginManager.get('network');
    await pluginManager.stop('network');
    expect(instance?.start).toHaveBeenCalled();
    expect(instance?.stop).toHaveBeenCalled();
  });
});

describe('plugin manager (API driver)', () => {
  const apiPluginManager = new PluginManager({ request: {} } as any);

  it('registers APINetworkManager for the network plugin', async () => {
    apiPluginManager.register('network', {});
    expect(apiPluginManager.get('network')).toBeInstanceOf(APINetworkManager);
  });

  it('skips browser-only plugins for API drivers', async () => {
    apiPluginManager.registerAll({});
    expect(apiPluginManager.get('network')).toBeDefined();
    expect(apiPluginManager.get('browserconsole')).toBeUndefined();
    expect(apiPluginManager.get('performance')).toBeUndefined();
    expect(apiPluginManager.get('trace')).toBeUndefined();
  });

  it('output() surfaces network results from APINetworkManager', async () => {
    apiPluginManager.registerAll({});
    const network = apiPluginManager.get('network') as APINetworkManager;
    (network.stop as jest.Mock).mockResolvedValue([
      { url: 'http://x', request: { method: 'GET' } } as any,
    ]);
    const out = await apiPluginManager.output();
    expect(network.stop).toHaveBeenCalled();
    expect(out.networkinfo).toEqual([
      { url: 'http://x', request: { method: 'GET' } },
    ]);
    expect(out.browserconsole).toBeUndefined();
  });

  it('onStep does not throw when only network plugin is registered', () => {
    apiPluginManager.registerAll({});
    const step = { name: 'step1' } as any;
    expect(() => apiPluginManager.onStep(step)).not.toThrow();
    const network = apiPluginManager.get('network') as APINetworkManager;
    expect(network._currentStep).toBe(step);
  });
});
