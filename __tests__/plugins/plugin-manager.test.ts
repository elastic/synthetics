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
import { PluginManager } from '../../src/plugins';

jest.mock('../../src/plugins/network');

describe('plugin manager', () => {
  const pluginManager = new PluginManager({} as any);

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
    expect(instance.start).toHaveBeenCalled();
  });

  it('stop plugin by type', async () => {
    await pluginManager.register('network', {}).start();
    const instance = pluginManager.get('network');
    await pluginManager.stop('network');
    expect(instance.start).toHaveBeenCalled();
    expect(instance.stop).toHaveBeenCalled();
  });
});
