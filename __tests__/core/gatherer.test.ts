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
