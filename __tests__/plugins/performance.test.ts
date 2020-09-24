import { Gatherer } from '../../src/core/gatherer';
import { PerformanceManager } from '../../src/plugins/performance';
import { Server } from '../../utils/server';

describe('performance', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture page metrics', async () => {
    const driver = await Gatherer.setupDriver();
    const performance = new PerformanceManager(driver.client);
    await performance.start();
    await driver.page.goto(server.TEST_PAGE);
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
    await Gatherer.dispose(driver);
  });
});
