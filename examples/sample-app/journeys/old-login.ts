import { journey, step } from '../../../dist';

journey({ name: 'Old Login' }, async ({ page, params }) => {
  step('Go to home page', async () => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async () => {
    await page.click('a');
  });

  step('Enter username and password', async () => {
    await page.fill('input[name=username]', 'hamid');
    await page.fill('input[name=password]', 'test-pass');
  });

  step('submit form', async () => {
    await (await page.$('form')).evaluate(form => form.submit());
  });
});
