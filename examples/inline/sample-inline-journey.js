step('Go to home page', async () => {
  await page.goto('http://www.elastic.co');
});

step('Go to login page', async () => {
  await page.locator('text=Login').click();
});

step('Enter username and password', async () => {
  await page.fill('input[data-test-id=login-username]', 'test-username');
  await page.fill('input[data-test-id=login-password]', 'test-pass');
});

step('submit form', async () => {
  await (await page.locator('form')).evaluate(form => form.submit());
});
