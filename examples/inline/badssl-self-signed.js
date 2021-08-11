step('Go to home page', async () => {
  await page.goto('https://self-signed.badssl.com/');
});

step('wait for header', async () => {
  await page.waitForSelector('h1');
});
