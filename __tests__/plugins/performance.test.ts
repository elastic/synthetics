import fs from 'fs';
import { runner, step, journey } from '../../src/dsl/index';
import { PerformanceManager } from '../../src/plugins/performance';
import { generateTempPath } from '../../src/helpers';
import { Server } from '../../utils/server';

describe('performance', () => {
  const dest = generateTempPath();
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    fs.unlinkSync(dest);
    await server.close();
  });

  it('should capture page metrics', async () => {
    journey('Test', () => {
      step('capture page metrics', async ({ client, page }) => {
        try {
          const performance = new PerformanceManager(client);
          await performance.start();
          await page.goto(server.TEST_PAGE);
          const metrics = await performance.getMetrics();
          expect(Object.keys(metrics)).toEqual([
            'Timestamp',
            'Documents',
            'Frames',
            'JSEventListeners',
            'Nodes',
            'LayoutCount',
            'RecalcStyleCount',
            'LayoutDuration',
            'RecalcStyleDuration',
            'ScriptDuration',
            'TaskDuration',
            'JSHeapUsedSize',
            'JSHeapTotalSize',
          ]);
          await performance.stop();
        } catch (e) {
          fail(e);
        }
      });
    });
    await runner.run({
      outfd: fs.openSync(dest, 'w'),
    });
  });
});
