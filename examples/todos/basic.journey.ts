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

journey('Synthetics + APM', ({ page }) => {
  step('go to index page', async () => {
    await page.goto('http://localhost:8080/index');
    // make sure RUM request has been successfully sent to APM server
    await page.waitForResponse(response =>
      response.url().includes('/rum/events')
    );
  });

  step('go to unknown page', async () => {
    await page.goto('http://localhost:8080/unknown');
    // make sure RUM request has been successfully sent to APM server
    await page.waitForResponse(response =>
      response.url().includes('/rum/events')
    );
  });
});
