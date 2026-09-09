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

// Creates a Synthetics private location against the Fleet agent policy
// elastic-package provisions, creates http/tcp/browser monitors against it,
// and verifies results directly in Elasticsearch -- no Kibana UI involved.
// Requires the Synthetics private-locations API (Kibana >= 8.7.0).

import { journey, step, beforeAll } from '@elastic/synthetics';
import axios from 'axios';
import https from 'https';
import semver from 'semver';

const stackVersion = process.env.STACK_VERSION.split('-')[0];

if (semver.satisfies(stackVersion, '>=8.7.0')) {
  const KIBANA_URL = 'https://localhost:5601';
  const ES_URL = 'https://localhost:9200';
  const AUTH = { username: 'elastic', password: 'changeme' };
  const KBN_HEADERS = { 'kbn-xsrf': 'true' };
  const AGENT_POLICY_NAME = 'Elastic-Agent (elastic-package)';
  const PRIVATE_LOCATION_LABEL = 'e2e-private-location';
  // The elastic-package stack's Elasticsearch/Kibana certs are self-signed.
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  const kbn = axios.create({
    baseURL: KIBANA_URL,
    auth: AUTH,
    headers: KBN_HEADERS,
    httpsAgent,
  });
  const es = axios.create({ baseURL: ES_URL, auth: AUTH, httpsAgent });

  beforeAll(async () => {
    console.info(`Looking up Fleet agent policy "${AGENT_POLICY_NAME}"`);
    const { data: agentPolicies } = await kbn.get('/api/fleet/agent_policies');
    const agentPolicy = agentPolicies.items.find(
      policy => policy.name === AGENT_POLICY_NAME
    );
    if (!agentPolicy) {
      throw new Error(
        `Could not find the elastic-package Fleet agent policy "${AGENT_POLICY_NAME}"`
      );
    }

    const { data: existingLocations } = await kbn.get(
      '/api/synthetics/private_locations'
    );
    if (existingLocations.some(loc => loc.label === PRIVATE_LOCATION_LABEL)) {
      console.info(
        `Private location "${PRIVATE_LOCATION_LABEL}" already exists, reusing it`
      );
      return;
    }

    console.info(`Creating private location "${PRIVATE_LOCATION_LABEL}"`);
    await kbn.post('/api/synthetics/private_locations', {
      label: PRIVATE_LOCATION_LABEL,
      agentPolicyId: agentPolicy.id,
    });
  });

  class MonitorCheckFailedError extends Error {}

  async function createMonitor(monitor) {
    const { data } = await kbn.post('/api/synthetics/monitors', {
      ...monitor,
      private_locations: [PRIVATE_LOCATION_LABEL],
      schedule: 1,
      enabled: true,
    });
    console.info(`Monitor "${monitor.name}" created with id ${data.id}`);
    return data.id;
  }

  async function waitForMonitorData(monitorId, timeoutMs = 3 * 60 * 1000) {
    console.info(`Waiting for synthetics data for monitor ${monitorId}`);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const { data } = await es.post('/synthetics-*/_search', {
          query: {
            bool: {
              filter: [
                { term: { 'monitor.id': monitorId } },
                { exists: { field: 'summary' } },
              ],
            },
          },
          sort: [{ '@timestamp': 'desc' }],
          size: 1,
        });
        const hit = data?.hits?.hits?.[0]?._source;
        if (hit?.summary?.up >= 1) {
          console.info(`Data for monitor ${monitorId} indexed successfully`);
          return;
        }
        // A down result means the check ran and failed -- that's a real
        // failure (e.g. a broken agent), not something more polling fixes.
        if (hit?.summary?.down >= 1) {
          throw new MonitorCheckFailedError(
            `Monitor ${monitorId} check failed: ${
              hit.error?.message ?? JSON.stringify(hit.summary)
            }`
          );
        }
      } catch (e) {
        if (e instanceof MonitorCheckFailedError) throw e;
        // keep polling on transient/network errors until the timeout
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error(
      `Timed out waiting for synthetics data for monitor ${monitorId}`
    );
  }

  journey(`${stackVersion} e2e test synthetics api - http`, async () => {
    let monitorId;

    step('create an http monitor via API', async () => {
      monitorId = await createMonitor({
        type: 'http',
        name: 'Sample http monitor (api)',
        url: 'https://elastic.co',
      });
    });

    step('wait for synthetics data', async () => {
      await waitForMonitorData(monitorId);
    });
  });

  journey(`${stackVersion} e2e test synthetics api - tcp`, async () => {
    let monitorId;

    step('create a tcp monitor via API', async () => {
      monitorId = await createMonitor({
        type: 'tcp',
        name: 'Sample tcp monitor (api)',
        host: 'smtp.gmail.com:587',
      });
    });

    step('wait for synthetics data', async () => {
      await waitForMonitorData(monitorId);
    });
  });

  // icmp isn't tested here: it requires a raw-socket capability the
  // elastic-package-provisioned agent container doesn't grant, causing
  // every check to fail with "could not write to conn: write udp
  // 0.0.0.0:1->x.x.x.x: invalid argument" regardless of stack version.

  journey(`${stackVersion} e2e test synthetics api - browser`, async () => {
    let monitorId;

    step('create a browser monitor via API', async () => {
      monitorId = await createMonitor({
        type: 'browser',
        name: 'Sample browser monitor (api)',
        inline_script: `
          step('load homepage', async () => {
            await page.goto('https://www.elastic.co');
          });
        `,
      });
    });

    step('wait for synthetics data', async () => {
      await waitForMonitorData(monitorId);
    });
  });
}
