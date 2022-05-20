import { journey, step, monitor, expect } from '@elastic/synthetics';

journey('My Example Journey', ({ page, params }) => {
  // Only relevant for the push command to create
  // monitors in Kibana
  monitor.use({
    id: 'example-monitor',
    schedule: 10,
  });
  step('launch application', async () => {
    await page.goto(params.url);
  });

  step('assert title', async () => {
    const header = await page.$('h1');
    expect(await header.textContent()).toBe('todos');
  });
});
