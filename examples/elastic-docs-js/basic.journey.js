const { journey, step } = require('@elastic/synthetics');
const assert = require('assert');

journey('Navigate to docs', async ({ page, params }) => {
  step('go to elastic homepage', async () => {
    await page.goto('https://www.elastic.co');
  });

  step('hover on learn', async () => {
    await page.hover('[data-nav-item=learn]');
  });

  step('click on docs in menu', async () => {
    await page.click('a[href="/guide"]');
  });
});

journey('check that docs mention cloud', async ({ page }) => {
  step('go to docs homepage', async () => {
    await page.goto('https://www.elastic.co/guide/index.html');
  });

  step('check for expected product titles', async () => {
    assert.match(await page.innerHTML('body'), /cloud/i);
  });
});
