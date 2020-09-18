import { NetworkManager } from '../../src/plugins/network';
import { PluginManager } from '../../src/plugins';

jest.mock('../../src/plugins/network');

describe('plugin manager', () => {
  const pluginManager = new PluginManager({} as any);

  it('start plugin with given type', async () => {
    await pluginManager.start('network');
    const instance = pluginManager.get(NetworkManager);
    expect(instance.start).toHaveBeenCalled();
  });

  it('get returns plugin instance', async () => {
    await pluginManager.start('network');
    const instance = pluginManager.get(NetworkManager);
    expect(instance).toBeInstanceOf(NetworkManager);
  });

  it('stop plugin on output generation', async () => {
    await pluginManager.start('network');
    const instance = pluginManager.get(NetworkManager);
    await pluginManager.output();
    expect(instance.start).toHaveBeenCalled();
    expect(instance.stop).toHaveBeenCalled();
  });
});
