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

import { beforeAll, journey, step, expect } from '@elastic/synthetics';
import axios from 'axios';

beforeAll(async () => {
  await waitForElasticSearch();
});

async function logIn(page) {
  await page.fill('[data-test-subj="loginUsername"]', 'elastic');
  await page.fill('[data-test-subj="loginPassword"]', 'changeme');
  await page.click('[data-test-subj="loginSubmit"]');
}

async function goToSyntheticsIntegrationPage(page) {
  console.info('Navigating to Elastic Synthetics Integration page')
  await page.goto('http://localhost:5601/app/integrations/detail/synthetics/overview');
  await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 10000 });
  const isUnauthenticated = await page.isVisible('[data-test-subj="loginUsername"]');
  if (isUnauthenticated) {
    await logIn(page);
  }
  await page.click('[data-test-subj="addIntegrationPolicyButton"]', { timeout: 10 * 1000 });
  /* We need to ensure that Elastic Synthetics integration page is fully loaded, including the UI logic.
   * Our UI logic clears out the name input when the page is first loaded. If we don't wait, we run the risk 
   * of playwright input being overwritten by Kibana logic clearing out the field. Playwright doesn't have
   * a mechanism to wait for the value of input to be empty, so for now, we are using a simple timeout */
  await page.waitForTimeout(10 * 1000);
}

async function goToUptime(page) {
  console.info('Navigating to Uptime overview page')
  await page.goto('http://localhost:5601/app/uptime');
  await page.waitForSelector('h1', { timeout: 10000 });
}

async function createIntegrationPolicyName({ page, policyName }) {
  await page.waitForSelector('[data-test-subj="packagePolicyNameInput"]', { timeout: 10000 });
  await page.fill('[data-test-subj="packagePolicyNameInput"]', policyName);
}

async function confirmAndSavePolicy(page) {
  await page.click('[data-test-subj="createPackagePolicySaveButton"]');
  await page.click('[data-test-subj="confirmModalConfirmButton"]');
  await page.waitForSelector('[data-test-subj="packagePolicyCreateSuccessToast"]', { timeout: 20000 });
}

async function checkForSyntheticsData({ page, journeyName }) {
  const overviewH1 = await page.textContent('h1');
  if (overviewH1 === 'Welcome to Elastic Observability!') {
    console.info('Refreshing Uptime')
    await goToUptime(page);
    await checkForSyntheticsData({ page, journeyName});
    return;
  }
  await page.click(`text=${journeyName}`, { timeout: 300 * 1000 });
  console.info(`Data for ${journeyName} indexed successfully`)
}

journey('E2e test synthetics - http', async ({ page }) => {
  const journeyName = 'Sample http integration policy';

  step('Go to synthetics integration page', async () => {
    await goToSyntheticsIntegrationPage(page);
  });

  step('create an http monitor', async () => {
    await createIntegrationPolicyName({ page, policyName: journeyName });
    await page.fill('[data-test-subj="syntheticsUrlField"]', 'https://elastic.co');
    await confirmAndSavePolicy(page);
    console.info(`Monitor for ${journeyName} created successfully`)
  });

  step('go to uptime', async () => {
    await goToUptime(page);
  });

  step('wait for synthetics data', async () => {
    await checkForSyntheticsData({ page, journeyName });
  });
});

journey('E2e test synthetics - tcp', async ({ page }) => {
  const journeyName = 'Sample tcp integration policy';

  step('Go to synthetics integration page', async () => {
    await goToSyntheticsIntegrationPage(page);
  });

  step('create an tcp monitor', async () => {
    await createIntegrationPolicyName({ page, policyName: journeyName });
    await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'tcp');
    await page.fill('[data-test-subj="syntheticsTCPHostField"]', 'smtp.gmail.com:587');
    await confirmAndSavePolicy(page);
    console.info(`Monitor for ${journeyName} created successfully`)
  });

  step('go to uptime', async () => {
    await goToUptime(page);
  });

  step('wait for synthetics data', async () => {
    await checkForSyntheticsData({ page, journeyName });
  });
});

// journey('E2e test synthetics - icmp', async ({ page }) => {
//   const journeyName = 'Sample icmp integration policy';

//   step('Go to synthetics integration page', async () => {
//     await goToSyntheticsIntegrationPage(page);
//   });

//   step('create an icmp monitor', async () => {
//     await createIntegrationPolicyName({ page, policyName: journeyName });
//     await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'icmp');
//     await page.fill('[data-test-subj="syntheticsICMPHostField"]', '1.1.1.1');
//     await confirmAndSavePolicy(page);
//   });

//   step('go to uptime', async () => {
//     await goToUptime(page);
//   });

//   step('wait for synthetics data', async () => {
//     await checkForSyntheticsData({ page, journeyName });
//   });
// });

journey('E2e test synthetics - browser', async ({ page }) => {
  const journeyName = 'Sample browser integration policy';

  step('Go to synthetics integration page', async () => {
    await goToSyntheticsIntegrationPage(page);
  });

  step('create an browser monitor', async () => {
    await createIntegrationPolicyName({ page, policyName: journeyName });
    await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'browser');
    await page.fill('[data-test-subj="syntheticsBrowserZipUrl"]', 'https://github.com/elastic/synthetics-demo/archive/refs/heads/main.zip');
    await page.fill('[data-test-subj="syntheticsBrowserZipUrlFolder"]', 'todos/synthetics-tests');
    await confirmAndSavePolicy(page);
  });

  step('go to uptime', async () => {
    await goToUptime(page);
  });

  step('wait for synthetics data', async () => {
    await checkForSyntheticsData({ page, journeyName });
  });
});

async function waitForElasticSearch() {
  console.info('Waiting for Elastic Search  to start');
  let esStatus = false;

  while (!esStatus) {
    try {
      const { data } = await axios.get('http://localhost:9200/_cluster/health', {
        auth: {
          username: 'elastic',
          password: 'changeme'
        }
      });
      esStatus = data?.status !== 'red';
    } catch (e) {
      throw new Error(e);
    }
  }
}
