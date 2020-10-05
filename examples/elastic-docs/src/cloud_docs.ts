import { journey, step } from '@elastic/synthetics';
import { goToDocsHome } from './common';
import * as expect from 'expect';

journey('a failing journey', async ({ page }) => {
  goToDocsHome({ page });

  step('check for value that does not exist product titles', async () => {
    expect(await page.innerHTML('body')).toMatch(
      /thisstringisnotinthepageiguaranteeit/
    );
  });
});
