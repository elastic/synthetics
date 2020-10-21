import { Gatherer } from '../../src/core/gatherer';
import { BrowserConsole } from '../../src/plugins';
import { Server } from '../../utils/server';

describe('BrowserConsole', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture browser console logs', async () => {
    const driver = await Gatherer.setupDriver();
    const browserConsole = new BrowserConsole(driver.page);
    browserConsole.start();
    await driver.page.goto(server.TEST_PAGE);
    browserConsole.currentStep = { name: 'step-name', index: 0 };
    await driver.page.evaluate(() =>
      console.warn('test-message', 1, { test: 'test' })
    );

    const messages = browserConsole.stop();
    const testMessage = messages.find(m => m.text.indexOf('test-message') >= 0);
    expect(testMessage.text).toEqual('test-message 1 JSHandle@object');
    expect(testMessage.type).toEqual('warning');
    expect(testMessage.timestamp).toBeDefined();
    expect(testMessage.step).toEqual({ name: 'step-name', index: 0 });
    await Gatherer.dispose(driver);
  });
});
