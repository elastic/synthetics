import { Tracing, filterFilmstrips } from '../../src/plugins/tracing';
import { Gatherer } from '../../src/core/gatherer';
import { Server } from '../../utils/server';

describe('tracing', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture filmstrips', async () => {
    const driver = await Gatherer.setupDriver();
    const tracer = new Tracing();
    await tracer.start(driver.client);
    await driver.page.goto(server.TEST_PAGE);
    const events = await tracer.stop(driver.client);
    expect(events.toString('utf-8')).toContain('screenshot');
    const filmstrips = filterFilmstrips(events);
    expect(filmstrips[0]).toMatchObject({
      snapshot: expect.any(String),
      name: 'Screenshot',
      ts: expect.any(Number),
    });
    await Gatherer.dispose(driver);
  });
});
