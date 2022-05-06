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
import semver from 'semver';

const stackVersion = process.env.STACK_VERSION.split('-')[0];

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
  await page.click('[data-test-subj="addIntegrationPolicyButton"]', { timeout: 10 * 1500 });
  /* We need to ensure that Elastic Synthetics integration page is fully loaded, including the UI logic.
   * Our UI logic clears out the name input when the page is first loaded. If we don't wait, we run the risk 
   * of playwright input being overwritten by Kibana logic clearing out the field. Playwright doesn't have
   * a mechanism to wait for the value of input to be empty, so for now, we are using a simple timeout */
  await page.waitForTimeout(10 * 1000);
}

async function goToUptime(page) {
  console.info('Navigating to Uptime overview page')
  await page.goto('http://localhost:5601/app/uptime');
}

async function selectAgentPolicy({ page }) {
  const hosts = await page.isVisible('text="Existing hosts"');
  if (hosts) {
    await page.click('text="Existing hosts"');
    if (semver.satisfies(stackVersion, '>=8.2.0')) {
      await page.click('[data-test-subj="agentPolicySelect"]');
      await page.click('text="Elastic-Agent (elastic-package)"');
    } else {
      await page.selectOption('[data-test-subj="agentPolicySelect"]', { label: 'Elastic-Agent (elastic-package)' });
    }
    await page.waitForSelector('text="Elastic-Agent (elastic-package)"');
  }
  await page.click('[data-test-subj="packagePolicyNameInput"]');
}

async function createIntegrationPolicyName({ page, policyName }) {
  await page.waitForSelector('[data-test-subj="packagePolicyNameInput"]', { timeout: 10000 });
  await page.fill('[data-test-subj="packagePolicyNameInput"]', policyName);
}

async function confirmAndSavePolicy(page) {
  await page.click('[data-test-subj="createPackagePolicySaveButton"]');
  await Promise.all([page.waitForNavigation(), page.click('[data-test-subj="confirmModalConfirmButton"]')]);
}

async function checkForSyntheticsData({ page, journeyName }) {
  await page.fill('[data-test-subj="queryInput"]', journeyName);
  await page.click(`a:has-text("${journeyName}")`, { timeout: 300 * 1000 });
  console.info(`Data for ${journeyName} indexed successfully`)
}

journey(`${stackVersion} check that fleet server is up`, async ({ page }) => {
  step('navigate to Fleet page', async () => {
    console.info('Navigating to Fleet page')
    await page.goto('http://localhost:5601/app/fleet/agents');
    await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 10000 });
    const isUnauthenticated = await page.isVisible('[data-test-subj="loginUsername"]');
    if (isUnauthenticated) {
      await logIn(page);
    }
  })


  step('check that Fleet server is up', async () => {
    await page.waitForSelector('text=Elastic-Agent (elastic-package)');
    await page.waitForSelector('text=Fleet Server (elastic-package)');
    await page.waitForSelector('text=docker-fleet-agent');
    await page.waitForSelector('text=docker-fleet-server');
    console.info('Fleet server appears to be up')
  });
});

journey(`${stackVersion} e2e test synthetics - http`, async ({ page }) => {
  const journeyName = 'Sample http integration policy';

  step('Go to synthetics integration page', async () => {
    await goToSyntheticsIntegrationPage(page);
  });

  step('create an http monitor', async () => {
    await createIntegrationPolicyName({ page, policyName: journeyName });
    await page.fill('[data-test-subj="syntheticsUrlField"]', 'https://elastic.co');
    await selectAgentPolicy({ page });
    await page.click('[data-test-subj="syntheticsUrlField"]');
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

// journey(`${stackVersion} e2e test synthetics - tcp`, async ({ page }) => {
//   const journeyName = 'Sample tcp integration policy';

//   step('Go to synthetics integration page', async () => {
//     await goToSyntheticsIntegrationPage(page);
//   });

//   step('create an tcp monitor', async () => {
//     await createIntegrationPolicyName({ page, policyName: journeyName });
//     await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'tcp');
//     await page.fill('[data-test-subj="syntheticsTCPHostField"]', 'smtp.gmail.com:587');
//     await selectAgentPolicy({ page });
//     await confirmAndSavePolicy(page);
//     console.info(`Monitor for ${journeyName} created successfully`)
//   });

//   step('go to uptime', async () => {
//     await goToUptime(page);
//   });

//   step('wait for synthetics data', async () => {
//     await checkForSyntheticsData({ page, journeyName });
//   });
// });

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

// journey(`${stackVersion} e2e test synthetics - browser`, async ({ page }) => {
//   const journeyName = 'Sample browser integration policy';

//   step('Go to synthetics integration page', async () => {
//     await goToSyntheticsIntegrationPage(page);
//   });

//   step('create an browser monitor', async () => {
//     await createIntegrationPolicyName({ page, policyName: journeyName });
//     await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'browser');
//     await page.fill('[data-test-subj="syntheticsBrowserZipUrl"]', 'https://github.com/elastic/synthetics-demo/archive/refs/heads/main.zip');
//     await page.fill('[data-test-subj="syntheticsBrowserZipUrlFolder"]', 'todos/synthetics-tests');
//     await selectAgentPolicy({ page });
//     await confirmAndSavePolicy(page);
//   });

//   step('go to uptime', async () => {
//     await goToUptime(page);
//   });

//   step('wait for synthetics data', async () => {
//     await checkForSyntheticsData({ page, journeyName });
//   });
// });

// if (semver.satisfies(stackVersion, '>=8.0.1')) {
//   journey(`${stackVersion} e2e test synthetics - browser - inline`, async ({ page }) => {
//     const journeyName = 'Sample browser inline integration policy';

//     step('Go to synthetics integration page', async () => {
//       await goToSyntheticsIntegrationPage(page);
//     });

//     step('create an browser monitor', async () => {
//       await createIntegrationPolicyName({ page, policyName: journeyName });
//       await page.selectOption('[data-test-subj="syntheticsMonitorTypeField"]', 'browser');
//       await page.click('[data-test-subj="syntheticsSourceTab__inline"]');
//       await page.fill('[data-test-subj=codeEditorContainer] textarea', `
//         step('load homepage', async () => {
//           await page.goto('https://www.elastic.co');
//         });
//       `);
//       await selectAgentPolicy({ page });
//       await confirmAndSavePolicy(page);
//     });

//     step('go to uptime', async () => {
//       await goToUptime(page);
//     });

//     step('wait for synthetics data', async () => {
//       await checkForSyntheticsData({ page, journeyName });
//     });
//   });
// }

journey(`${stackVersion} check that policies are enrolled correctly`, async ({ page }) => {
  step('check that integration is enrolled in the correct policy', async () => {
    console.info('Navigating to Fleet page')
    await page.goto('http://localhost:5601/app/fleet/policies/elastic-agent-managed-ep');
    await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 10000 });
    const isUnauthenticated = await page.isVisible('[data-test-subj="loginUsername"]');
    if (isUnauthenticated) {
      await logIn(page);
    }
  })


  step('check that policies are enrolled correctly', async () => {
    // await page.waitForSelector('text=Sample browser integration policy');
    // await page.waitForSelector('text=Sample browser inline integration policy');
    await page.waitForSelector('text=Sample http integration policy');
    // await page.waitForSelector('text=Sample tcp integration policy');
    console.info('Policy enrolled correctly')
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
