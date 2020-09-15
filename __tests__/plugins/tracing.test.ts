import fs from 'fs';
import { runner, step, journey } from '../../src/dsl/index';
import { Tracing } from '../../src/plugins/tracing';
import { generateTempPath } from '../../src/helpers';

describe('tracing', () => {
  const dest = generateTempPath();
  afterAll(() => {
    fs.unlinkSync(dest);
  });

  it('should capture filmstrips', async () => {
    journey('Test', () => {
      step('capture filmstrips', async ({ client, page }) => {
        const tracer = new Tracing();
        await tracer.start(client);
        await page.goto('https://vigneshh.in');
        const events = await tracer.stop(client);
        expect(events.toString('utf-8')).toContain('screenshot');
      });
    });
    await runner.run({
      headless: true,
      outfd: fs.openSync(dest, 'w'),
    });
  });
});
