import { journey, step } from '../../../dist';

journey({ name: 'New Login' }, async ({ page, params }) => {
  step('Go to home page', async () => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async () => {
    await page.click('a');
  });
});
