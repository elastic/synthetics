import fs from 'fs';
import { runner, step, journey } from '../../src/dsl/index';
import { generateTempPath } from '../../src/helpers';
import { NetworkManager } from '../../src/plugins/network';
import { Server } from '../utils/server';

describe('network', () => {
  const dest = generateTempPath();
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    fs.unlinkSync(dest);
    await server.close();
  });

  it('should capture network info', async () => {
    journey('Test', () => {
      step('net info', async ({ client, page }) => {
        const network = new NetworkManager();
        await network.start(client);
        await page.goto(server.TEST_PAGE);
        const netinfo = await network.stop();
        expect(netinfo.length).toBeGreaterThan(0);
      });
    });
    await runner.run({
      headless: true,
      outfd: fs.openSync(dest, 'w'),
    });
  });
});
