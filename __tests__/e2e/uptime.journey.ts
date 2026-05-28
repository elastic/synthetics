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

const ES_URL = 'http://localhost:9220';
const KIBANA_URL = 'http://localhost:5620';
const AUTH = { username: 'elastic', password: 'changeme' };
const KBN_HEADERS = { 'kbn-xsrf': 'true' };

beforeAll(async () => {
  try {
    await waitForOrTimeout(waitForElasticSearch(), 60e3);
    await waitForOrTimeout(waitForKibana(), 120e3);
    // Heartbeat 8.19 routes browser-monitor pings to the
    // `synthetics-browser-*` data stream. The mappings for that data stream
    // (including `monitor.timespan` as `date_range`, which the legacy Uptime
    // snapshot query relies on) ship inside the Synthetics Fleet integration
    // package — they are NOT part of the bare x-pack `synthetics@mappings`
    // template. Installing the integration here pulls in the proper
    // composable templates so the data stream gets created with correct
    // mappings, and Kibana's legacy Uptime queries return real data.
    await installSyntheticsIntegration();
    // Modern Kibana (>= 8.15) hides the legacy Uptime app by default and
    // points it at the `heartbeat-*` index pattern. The synthetics docker
    // image now writes browser-monitor docs to `synthetics-*` data streams,
    // so both the app and the index pattern must be opted in.
    await configureLegacyUptimeApp();
    await waitForOrTimeout(waitForSyntheticsData(), 180e3);
  } catch (e) {
    console.log(`failed to set up e2e test dependencies: ${e}`);
    throw e;
  }
});

journey('E2e test synthetics', async ({ page }) => {
  async function refreshUptimeApp() {
    while (!(await page.$('div.euiBasicTable'))) {
      await page.click('[data-test-subj=superDatePickerApplyTimeButton]', {
        timeout: 60 * 1000,
      });
    }
  }

  step('Go to kibana uptime app', async () => {
    // With security enabled, send credentials on every request so we
    // bypass the login form entirely (Kibana accepts the basic auth
    // provider by default).
    await page.context().setExtraHTTPHeaders({
      Authorization:
        'Basic ' +
        Buffer.from(`${AUTH.username}:${AUTH.password}`).toString('base64'),
    });
    await page.goto(`${KIBANA_URL}/app/uptime`, { waitUntil: 'networkidle' });
  });

  step('Check if there is table data', async () => {
    await page.click('[data-test-subj=uptimeOverviewPage]', {
      timeout: 60 * 1000,
    });
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
        `${ES_URL}/heartbeat-*,synthetics-*/_search`,
        {
          query: {
            bool: {
              filter: [
                { term: { 'monitor.id': 'my-monitor' } },
                { exists: { field: 'summary' } },
              ],
            },
          },
        },
        { auth: AUTH }
      );

      status = data?.hits.total.value >= 1;
    } catch (e) {}
  }
}

async function waitForElasticSearch() {
  console.log('Waiting for Elastic Search  to start');
  let esStatus = false;

  while (!esStatus) {
    try {
      const { data } = await axios.get(`${ES_URL}/_cluster/health`, {
        auth: AUTH,
      });
      esStatus = data?.status !== 'red';
    } catch (e) {}
  }
}

async function waitForKibana() {
  console.log('Waiting for kibana server to start');

  let esStatus = false;

  while (!esStatus) {
    try {
      const { data } = await axios.get(`${KIBANA_URL}/api/status`, {
        auth: AUTH,
      });
      esStatus = data?.status.overall.level === 'available';
    } catch (e) {}
  }
}

async function installSyntheticsIntegration() {
  // Skip the install (and the destructive data-stream drop below) if the
  // package is already installed — e.g. on a warm re-run against a stack
  // that's already been bootstrapped. Only install/drop when we actually
  // need to, which removes the race window altogether.
  const { data: pkg } = await axios.get(
    `${KIBANA_URL}/api/fleet/epm/packages/synthetics`,
    { auth: AUTH, headers: KBN_HEADERS }
  );
  if (pkg?.item?.status === 'installed') {
    console.log('Synthetics Fleet integration already installed, skipping');
    return;
  }

  console.log('Installing Synthetics Fleet integration package');
  await axios.post(
    `${KIBANA_URL}/api/fleet/epm/packages/synthetics`,
    { force: true },
    { auth: AUTH, headers: KBN_HEADERS }
  );
  // If Heartbeat raced ahead and created the data stream with the default
  // (dynamic) mapping before the integration's templates were installed,
  // drop it so the next publish recreates it from the proper template.
  try {
    await axios.delete(`${ES_URL}/_data_stream/synthetics-browser-default`, {
      auth: AUTH,
    });
  } catch (e) {
    // 404 means it doesn't exist yet — fine.
  }
}

async function configureLegacyUptimeApp() {
  console.log('Enabling legacy Uptime app and widening heartbeat indices');
  await axios.post(
    `${KIBANA_URL}/api/kibana/settings`,
    { changes: { 'observability:enableLegacyUptimeApp': true } },
    { auth: AUTH, headers: KBN_HEADERS }
  );
  await axios.put(
    `${KIBANA_URL}/api/uptime/settings`,
    { heartbeatIndices: 'heartbeat-*,synthetics-*' },
    {
      auth: AUTH,
      headers: { ...KBN_HEADERS, 'elastic-api-version': '2023-10-31' },
    }
  );
}

async function waitForOrTimeout(awaitable: Promise<void>, timeout: number) {
  return Promise.race([
    awaitable,
    new Promise((_, reject) =>
      setTimeout(() => reject(`timeout expired: ${timeout}`), timeout)
    ),
  ]);
}
