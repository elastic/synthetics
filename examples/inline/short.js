step('load homepage', async () => {
  await page.goto('https://www.elastic.co');
});
step('hover over products menu', async () => {
  const [cookieBanner] = await page.$$('#iubenda-cs-banner');
  if (cookieBanner) {
    await page.click('.iubenda-cs-accept-btn');
  }
  await page.hover('css=[data-nav-item=products]');
});
