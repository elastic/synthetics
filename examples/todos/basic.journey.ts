import { journey, step, expect } from '@elastic/synthetics';
import { join } from 'path';

journey('check if title is present', ({ page }) => {
  step('launch app', async () => {
    const path = 'file://' + join(__dirname, 'app', 'index.html');
    await page.goto(path);
  });

  step('assert title', async () => {
    const header = await page.$('h1');
    expect(await header.textContent()).toBe('todos');
  });
});

journey('check if input placeholder is correct', ({ page }) => {
  step('launch app', async () => {
    const path = 'file://' + join(__dirname, 'app', 'index.html');
    await page.goto(path);
  });

  step('assert placeholder value', async () => {
    const input = await page.$('input.new-todo');
    expect(await input.getAttribute('placeholder')).toBe(
      'What needs to be done?'
    );
  });
});
