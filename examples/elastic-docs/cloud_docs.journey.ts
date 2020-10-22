import { journey, step } from '@elastic/synthetics';
import { goToDocsHome, goToElasticHome } from './common';
import assert from 'assert';

journey('a failing journey', async ({ page }) => {
  goToDocsHome({ page });

  step('check for value that does not exist product titles', async () => {
    assert.match(
      await page.innerHTML('body'),
      /thisstringisnotinthepageiguaranteeit/
    );
  });
});
