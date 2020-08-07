step('Go to home page', async (params) => {
    await page.goto(params.homepage)
})

step('Go to login page', async (params) => {
    await page.click('a')
})

step('Enter username and password', async () => {
    await page.fill('input[name=username]', 'hamid')
    await page.fill('input[name=password]', 'test-pass')
})

step('submit form', async () => {
    await (await page.$('form')).evaluate(form => form.submit())
})