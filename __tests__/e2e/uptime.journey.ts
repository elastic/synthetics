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

import { beforeAll, journey, step } from '@elastic/synthetics';
import axios from 'axios';

beforeAll(async () => {
  await waitForElasticSearch();
  await waitForSyntheticsData();
  await waitForKibana();
});

journey('E2e test synthetics', async ({ page }) => {
  async function refreshUptimeApp() {
    while (!(await page.$('div.euiBasicTable'))) {
      await page.click('[data-test-subj=superDatePickerApplyTimeButton]', {
        timeout: 40 * 1000,
      });
    }
  }

  step('Go to kibana uptime app', async () => {
    await page.goto('http://localhost:5601/app/uptime');
  });

  step('Check if there is table data', async () => {
    await page.click('[data-test-subj=uptimeOverviewPage]');
    await refreshUptimeApp();
    await page.click('div.euiBasicTable', { timeout: 60 * 1000 });
  });

  step('Click on my monitor', async () => {
    await page.click('[data-test-subj=monitor-page-link-my-monitor]');
  });

  step('It navigates to details page', async () => {
    await page.click('[data-test-subj=uptimeMonitorPage]');
  });
});

async function waitForSyntheticsData() {
  console.log('Waiting for Synthetics to send data to ES for test monitor');
  let status = false;

  while (!status) {
    try {
      const { data } = await axios.post(
        'http://localhost:9200/heartbeat-*/_search',
        {
          query: {
            bool: {
              filter: [
                {
                  term: {
                    'monitor.id': 'my-monitor',
                  },
                },
                {
                  exists: {
                    field: 'summary',
                  },
                },
              ],
            },
          },
        }
      );

      // we want some data in uptime app
      status = data?.hits.total.value >= 2;
    } catch (e) {}
  }
}

async function waitForElasticSearch() {
  console.log('Waiting for Elastic Search  to start');
  let esStatus = false;

  while (!esStatus) {
    try {
      const { data } = await axios.get('http://localhost:9200/_cluster/health');
      esStatus = data?.status !== 'red';
    } catch (e) {}
  }
}

async function waitForKibana() {
  console.log('Waiting for kibana server to start');

  let esStatus = false;

  while (!esStatus) {
    try {
      const { data } = await axios.get('http://localhost:5601/api/status');
      esStatus = data?.status.overall.state === 'green';
    } catch (e) {}
  }
}
