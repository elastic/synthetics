import fs from 'fs';
import { runner, step, journey } from '../../src/dsl/index';
import { Tracing, filterFilmstrips } from '../../src/plugins/tracing';
import { generateTempPath } from '../../src/helpers';
import { Server } from '../../utils/server';

describe('tracing', () => {
  const dest = generateTempPath();
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    fs.unlinkSync(dest);
    await server.close();
  });

  it('should capture filmstrips', async () => {
    journey('Test', () => {
      step('capture filmstrips', async ({ client, page }) => {
        try {
          const tracer = new Tracing();
          await tracer.start(client);
          await page.goto(server.TEST_PAGE);
          const events = await tracer.stop(client);
          expect(events.toString('utf-8')).toContain('screenshot');
          const filmstrips = filterFilmstrips(events);
          expect(filmstrips[0]).toMatchObject({
            snapshot: expect.any(String),
            name: 'Screenshot',
            ts: expect.any(Number),
          });
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
