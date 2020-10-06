step('load homepage', async () => {
  await page.goto('https://www.elastic.co');
});
step('hover over products menu', async () => {
  await page.hover('css=[data-nav-item=products]');
});
