import { journey, step } from 'elastic-synthetics';

journey({ name: 'Old Login' }, () => {
  step('Go to home page', async (page, params) => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async page => {
    await page.click('a');
  });

  step('Enter username and password', async page => {
    await page.fill('input[name=username]', 'hamid');
    await page.fill('input[name=password]', 'test-pass');
  });

  step('submit form', async page => {
    await (await page.$('form')).evaluate(form => form.submit());
  });
});

journey({ name: 'New Login' }, () => {
  step('Go to home page', async (page, params) => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async page => {
    await page.click('a');
  });
});


journey("Visit a non-existant page", () => {
  step('go to home', async (page, params) => {
    await page.goto(params.homepage);
  });

step('go to home', async (page, params) => {
    await page.goto(params.homepage + "/non-existant");
  });
});