import { journey, step } from '../../dist';
import { goToDocsHome } from './common';
import * as assert from 'assert';

journey('a failing journey', async ({ page }) => {
  goToDocsHome({ page });

  step('check for value that does not exist product titles', async () => {
    assert.match(
      await page.innerHTML('body'),
      /thisstringisnotinthepageiguaranteeit/
    );
  });
});
