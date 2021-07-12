const { journey, step, expect } = require('@elastic/synthetics');

const URL = 'https://elastic-synthetics.vercel.app/';

const navigateToProductDetail = (page, params) => {
  step('visit landing page', async () => {
    await page.goto(params.url || URL);
    await page.waitForSelector('.card');
  });

  step('navigate to product detail page', async () => {
    const productImages = await page.$$('.card img');
    const randomCard = Math.floor(Math.random() * productImages.length);
    const product = productImages[randomCard];
    await Promise.all([page.waitForLoadState('load'), product.click()]);
  });
};

journey(
  { name: 'Browse products and recommendations flow', tags: ['browse'] },
  ({ page, params }) => {
    navigateToProductDetail(page, params);

    step('look for recommendations', async () => {
      const recommendationsNode = await page.$('text=Products you might like');
      expect(recommendationsNode).toBeDefined();
      // Waits for recommendation cards
      await page.waitForSelector('.card');
      const recommendedProducts = await page.$$('.card');
      expect(recommendedProducts.length).toBe(4);
    });
  }
);

journey({ name: 'Delete cart items', tags: ['cart'] }, ({ page, params }) => {
  navigateToProductDetail(page, params);

  step('Add items to cart', async () => {
    await page.selectOption('select[name="quantity"]', '2');
    await Promise.all([
      page.waitForNavigation({
        url: /cart/,
      }),
      page.click('text=Add to Cart'),
    ]);
  });

  step('empty cart items', async () => {
    expect(page.url()).toContain('cart');
    await page.waitForSelector('.container');
    const headline = await page.$('.container h3');
    expect(await headline.textContent()).toContain(
      '1 items in your Shopping Cart'
    );
    await Promise.all([
      page.waitForNavigation(),
      page.click('text=Empty cart'),
    ]);
  });

  step('verify empty shopping cart', async () => {
    await page.click('text=View Cart');
    expect(page.url()).toContain('cart');
    await page.waitForSelector('.container');
    const containerNode = await page.$('.container h3');
    expect(await containerNode.textContent()).toContain(
      'Your shopping cart is empty'
    );
  });
});

journey(
  { name: 'Product Checkout flow', tags: ['checkout'] },
  ({ page, params }) => {
    navigateToProductDetail(page, params);

    step('add product to cart', async () => {
      await page.selectOption('select[name="quantity"]', '3');
      await Promise.all([
        page.waitForNavigation({
          url: /cart/,
        }),
        page.click('text=Add to Cart'),
      ]);
    });

    step('check cart items and place the order', async () => {
      expect(page.url()).toContain('cart');
      await page.waitForSelector('.container');
      const headline = await page.$('.container h3');
      expect(await headline.textContent()).toContain(
        '1 items in your Shopping Cart'
      );
      await Promise.all([
        page.waitForNavigation({
          url: /checkout/,
        }),
        page.click('text=Place your order →'),
      ]);
    });

    step('verify the order details', async () => {
      expect(page.url()).toContain('checkout');
      await page.waitForSelector('.container');
      const containerNode = await page.$('.container .row');
      const content = await containerNode.textContent();
      expect(content).toContain('Your order is complete');
      expect(content).toContain('Order Confirmation');
    });
  }
);
