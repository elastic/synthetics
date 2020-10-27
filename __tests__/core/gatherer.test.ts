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

import { Gatherer } from '../../src/core/gatherer';
import { PluginManager } from '../../src/plugins';
import { NetworkManager } from '../../src/plugins/network';

jest.mock('../../src/plugins/network');

describe('Gatherer', () => {
  it('boot and dispose driver', async () => {
    const driver = await Gatherer.setupDriver(true);
    expect(typeof driver.page.goto).toBe('function');
    await Gatherer.dispose(driver);
  });

  it('begin recording based on flags', async () => {
    const driver = await Gatherer.setupDriver(true);
    const pluginManager = await Gatherer.beginRecording(driver, {
      network: true,
    });
    expect(pluginManager).toBeInstanceOf(PluginManager);
    const network = pluginManager.get(NetworkManager);
    expect(network.start).toHaveBeenCalled();
    await Gatherer.dispose(driver);
  });
});
