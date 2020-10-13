import { journey, step } from '../../../dist';

journey('Visit a non-existant page', async ({ page, params }) => {
  step('go to home', async () => {
    await page.goto(params.homepage);
  });

  step('go to home', async () => {
    await page.setDefaultTimeout(200);
    await page.goto(params.homepage + '/non-existant');
  });
});
