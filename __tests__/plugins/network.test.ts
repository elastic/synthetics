import { Gatherer } from '../../src/core/gatherer';
import { NetworkManager } from '../../src/plugins/network';
import { Server } from '../../utils/server';

describe('network', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture network info', async () => {
    const driver = await Gatherer.setupDriver();
    const network = new NetworkManager();
    await network.start(driver.client);
    await driver.page.goto(server.TEST_PAGE);
    const netinfo = await network.stop();
    expect(netinfo.length).toBeGreaterThan(0);
    await Gatherer.dispose(driver);
  });
});
