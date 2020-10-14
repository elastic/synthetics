import { journey, step, beforeAll, afterAll } from '@elastic/synthetics';
import { ChildProcess } from 'child_process';
import { startApp } from './index';

let appProcess: ChildProcess;
beforeAll(async () => {
  appProcess = await startApp();
});
afterAll(() => {
  if (appProcess) {
    console.log('Terminating service with SIGTERM');
    appProcess.kill('SIGTERM');
  }
});

journey({ name: 'Old Login' }, async ({ page, params }) => {
  step('Go to home page', async () => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async () => {
    await page.click('a');
  });

  step('Enter username and password', async () => {
    await page.fill('input[name=username]', 'hamid');
    await page.fill('input[name=password]', 'test-pass');
  });

  step('submit form', async () => {
    await (await page.$('form')).evaluate(form => form.submit());
  });
});

journey({ name: 'New Login' }, async ({ page, params }) => {
  step('Go to home page', async () => {
    await page.goto(params.homepage);
  });

  step('Go to login page', async () => {
    await page.click('a');
  });
});

journey('Visit a non-existant page', async ({ page, params }) => {
  step('go to home', async () => {
    await page.goto(params.homepage);
  });

  step('go to home', async () => {
    await page.goto(params.homepage + '/non-existant');
  });
});
