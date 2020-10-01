step("load homepage", async ({page, params}) => {
  await page.goto('https://www.elastic.co');
});
step("hover over products menu", async ({page}) => {
  await page.hover('css=[data-nav-item=products]');
});
