import { journey, step } from '@elastic/synthetics';
import { goToElasticHome, goToDocsHome } from './common';
import * as expect from 'expect';

journey('a failing journey', () => {
  goToDocsHome();

  step(
    'check for value that does not exist product titles',
    async ({ page }) => {
      expect(await page.innerHTML('body')).toMatch(
        /thisstringisnotinthepageiguaranteeit/
      );
    }
  );
});
