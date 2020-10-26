import { journey, step } from '@elastic/synthetics';
import * as assert from 'assert';

journey('Basic', async ({ page }) => {
  step('Go to grid', async () => {
    await page.
    await page.hover('[data-nav-item=learn]');
  });

  step('click on docs in menu', async () => {
    await page.click('a[href="/guide"]');
  });
});

journey('check that docs mention cloud', async ({ page }) => {
  goToDocsHome({ page });

  step('check for expected product titles', async () => {
    assert.match(await page.innerHTML('body'), /cloud/i);
  });
});
