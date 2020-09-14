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

type Plugin = NetworkManager | Tracing | PerformanceManager

export class PluginManager {

  protected plugins = new Map<PluginType, Plugin>();

  constructor(private session: CDPSession) { }

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
        instance = new PerformanceManager(this.session)
        instance.start()
        break;
    }

    this.plugins.set(type, instance);
    return instance
  }

  get<T extends Plugin>(type: PluginType): T {
    return this.plugins.get(type) as T
  }

  async output(): Promise<PluginOutput> {
    const data = {
      filmstrips: [],
      networkinfo: [],
    };
    for (const [type, plugin] of this.plugins) {
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
