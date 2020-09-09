import { NetworkManager } from './network';
import { Tracing, filterFilmstrips } from './tracing';
import { CDPSession } from 'playwright';
import { NetworkInfo, FilmStrip } from '../common_types';

type PluginType = 'network' | 'trace';

type PluginOutput = {
  filmstrips?: Array<FilmStrip>;
  networkinfo?: Array<NetworkInfo>;
};

export class PluginManager {
  protected plugins: Array<NetworkManager | Tracing> = [];

  constructor(private session: CDPSession) {}

  async start(type: PluginType) {
    let instance: NetworkManager | Tracing;
    switch (type) {
      case 'network':
        instance = new NetworkManager();
        break;
      case 'trace':
        instance = new Tracing();
    }
    this.plugins.push(instance);
    await instance.start(this.session);
  }

  async output(): Promise<PluginOutput> {
    const data = {
      filmstrips: [],
      networkinfo: [],
    };
    for (const plugin of this.plugins) {
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
