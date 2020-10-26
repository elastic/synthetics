const { journey, step } = require('@elastic/synthetics');
const assert = require('assert');

journey('a failing journey', async ({ page }) => {
  step('go to docs homepage', async () => {
    await page.goto('https://www.elastic.co/guide/index.html');
  });

  step('check for value that does not exist product titles', async () => {
    assert.match(
      await page.innerHTML('body'),
      /thisstringisnotinthepageiguaranteeit/
    );
  });
});
