import { step } from '../../dist';

export const goToElasticHome = ({ page }) => {
  step('go to elastic homepage', async () => {
    await page.goto('https://www.elastic.co');
  });
};

export const goToDocsHome = ({ page }) => {
  step('go to elastic homepage', async () => {
    await page.goto('https://www.elastic.co/guide/index.html');
  });
};
