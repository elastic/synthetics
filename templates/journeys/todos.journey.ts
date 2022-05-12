import { journey, step, expect } from '@elastic/synthetics';

journey('TodoMVC Synthetics test', ({ page, params }) => {
  step('launch application', async () => {
    await page.goto(params.url);
  });

  step('assert title', async () => {
    const header = await page.$('h1');
    expect(await header.textContent()).toBe('todos');
  });
});
