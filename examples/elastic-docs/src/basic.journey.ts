import { journey, step } from '@elastic/synthetics';
import { goToElasticHome, goToDocsHome } from './common';
import * as expect from 'expect';

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
    expect(await page.innerHTML('body')).toMatch(/cloud/i);
  });
});
