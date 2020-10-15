const { journey, step } = require('../../dist');

journey({ name: 'short' }, async ({ page, params }) => {
  step('load homepage', async () => {
    await page.goto('https://www.elastic.co');
  });
  step('hover over products menu', async () => {
    await page.hover('css=[data-nav-item=products]');
  });
});
