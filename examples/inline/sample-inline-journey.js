step('Go to home page', async () => {
  await page.goto('http://www.elastic.co');
});

step('Go to login page', async () => {
  await page.click('#navbarSupportedContent > ul > li:nth-child(2) > a');
});

step('Enter username and password', async () => {
  await page.fill('input[data-test-id=login-username]', 'hamid');
  await page.fill('input[data-test-id=login-password]', 'test-pass');
});

step('submit form', async () => {
  await (await page.$('form')).evaluate(form => form.submit());
});
