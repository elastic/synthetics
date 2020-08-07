import { journey, step } from 'elastic-synthetics';

const monitor = {
    name: 'elastic-cloud'
}

export const f = journey({name: 'Login'}, (page) => {
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