import { journey, step } from '@elastic/synthetics';
import { goToElasticHome, goToDocsHome } from './common';
import * as expect from 'expect';

journey('Navigate to docs', () => {
  goToElasticHome();

  step('hover on learn', async ({ page }) => {
    await page.hover('[data-nav-item=learn]');
  });

  step('click on docs in menu', async ({ page }) => {
    await page.click('a[href="/guide"]');
  });
});

journey('check that docs mention cloud', () => {
  goToDocsHome();

  step('check for expected product titles', async ({ page }) => {
    expect(await page.innerHTML('body')).toMatch(/cloud/i);
  });
});
