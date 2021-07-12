import { journey, step, expect } from '@elastic/synthetics';

journey('check if title is present', ({ page, params }) => {
  step('launch app', async () => {
    await page.goto(params.url);
  });

  step('assert title', async () => {
    const header = await page.$('h1');
    expect(await header.textContent()).toBe('todos');
  });
});

journey('check if input placeholder is correct', ({ page, params }) => {
  step('launch app', async () => {
    await page.goto(params.url);
  });

  step('assert placeholder value', async () => {
    const input = await page.$('input.new-todo');
    expect(await input.getAttribute('placeholder')).toBe(
      'What needs to be done?'
    );
  });
});
