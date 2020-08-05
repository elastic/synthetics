const monitor = {
    name: 'elastic-cloud'
}

journey(monitor, (page) => {
    step('Go to login page', async () => {
        await page.goto('https://cloud.elastic.co/login')
    })

    step('Enter username and password', async () => {
        await page.fill('input[data-test-id=login-username]', 'hamid')
        await page.fill('input[data-test-id=login-password]', 'test-pass')
    })

    step('Click login', async () => {
        await page.click('button[data-test-id=login-button]')
    })
})