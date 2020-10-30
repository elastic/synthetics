/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { journey, step } from '@elastic/synthetics';

journey('E2e test synthetics', async ({ page }) => {
  step('Go to kibana uptime app', async () => {
    await page.goto('http://localhost:5601/app/uptime');
  });

  step('Enter username and password', async () => {
    await page.fill('input[data-test-subj=loginUsername]', 'admin');
    await page.fill('input[data-test-subj=loginPassword]', 'changeme');
  });

  step('submit form', async () => {
    await page.click('button[data-test-subj=logbinSubmit]');
    // wait for loading
    await new Promise(r => setTimeout(r, 3000));
  });

  step('Check if there is table data', async () => {
    await page.click('[data-test-subj=uptimeOverviewPage]');
    await page.click('div.euiBasicTable', { timeout: 60 * 1000 });
  });

  step('Click on my monitor', async () => {
    await page.click('[data-test-subj=monitor-page-link-my-monitor]');
  });

  step('It navigates to details page', async () => {
    await page.click('[data-test-subj=uptimeMonitorPage]');
  });
});
