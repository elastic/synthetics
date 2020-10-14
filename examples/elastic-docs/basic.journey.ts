import { journey, step } from '../../../dist';
import { goToElasticHome, goToDocsHome } from './common';
import * as assert from 'assert';

journey('Navigate to docs', async ({ page }) => {
  goToElasticHome({ page });

  step('hover on learn', async () => {
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
