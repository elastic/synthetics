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

import { join } from 'path';
import {
  formatLocations,
  getLocations,
  groupLocations,
} from '../../src/locations';
import { LOCATIONS } from '../fixtures/locationinfo';
import { Server } from '../utils/server';
import { CLIMock } from '../utils/test-config';
import { mkdir, rm, writeFile } from 'fs/promises';
import { Straightforward } from 'straightforward';
import { AddressInfo } from 'net';

describe('Locations', () => {
  const apiKey = 'foo';
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
    server.route('/internal/uptime/service/locations', (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ locations: LOCATIONS }));
    });
  });
  afterAll(async () => {
    await server.close();
  });

  it('get locations', async () => {
    const locations = await getLocations({
      url: `${server.PREFIX}`,
      auth: apiKey,
    });
    expect(locations.length).toBe(5);
  });

  it('format and group locations by labels', async () => {
    const locations = await getLocations({
      url: `${server.PREFIX}`,
      auth: apiKey,
    });
    const formatted = formatLocations(locations);
    expect(formatted).toEqual({
      privateLocations: ['custom location 1', 'custom location 2'],
      publicLocations: ['japan', 'new_location', 'us_west'],
      allLocations: [
        'japan',
        'new_location',
        'us_west',
        'custom location 1 (private)',
        'custom location 2 (private)',
      ],
    });

    expect(groupLocations(formatted.allLocations)).toEqual({
      privateLocations: ['custom location 1', 'custom location 2'],
      locations: ['japan', 'new_location', 'us_west'],
    });
  });

  describe('CLI command', () => {
    const PROJECT_DIR = join(__dirname, 'new-project');
    async function fakeProjectSetup(settings: any) {
      await writeFile(
        join(PROJECT_DIR, 'synthetics.config.ts'),
        `export default ${JSON.stringify(settings)}`
      );
    }

    beforeAll(async () => {
      await mkdir(PROJECT_DIR, { recursive: true });
    });
    afterAll(async () => {
      await rm(PROJECT_DIR, { recursive: true, force: true });
    });

    const runLocations = async (
      args: Array<string> = [],
      cliEnv: NodeJS.ProcessEnv = {}
    ) => {
      const cli = new CLIMock()
        .args(['locations', ...args])
        .run({ cwd: PROJECT_DIR, env: { ...process.env, ...cliEnv } });
      expect(await cli.exitCode).toBe(0);
      return cli.stderr();
    };

    it('render public locations by default', async () => {
      const output = await runLocations();
      expect(output).not.toContain(`custom location`);
    });

    it('render private locations when options are provided', async () => {
      const output = await runLocations([
        '--url',
        server.PREFIX,
        '--auth',
        apiKey,
      ]);
      expect(output).toContain(`custom location 1`);
    });

    it('use project url settings for private locations', async () => {
      await fakeProjectSetup({ project: { url: server.PREFIX } });
      const output = await runLocations(['--auth', apiKey]);
      expect(output).toContain(`custom location 1`);
      expect(output).toContain(`custom location 2`);
    });

    describe('Proxy options', () => {
      let requests: Array<any> = [];
      let proxyServer: Straightforward;
      let tlsServer;
      let proxyUrl: string;

      beforeAll(async () => {
        proxyServer = new Straightforward();
        proxyServer.onConnect.use(async ({ req }, next) => {
          requests.push(req);
          return next();
        });
        await proxyServer.listen();
        tlsServer = await Server.create({ tls: true });
        tlsServer.route('/internal/uptime/service/locations', (req, res) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ locations: LOCATIONS }));
        });
        const server = proxyServer.server.address() as AddressInfo;
        proxyUrl = `http://localhost:${server.port}`;
      });

      afterAll(async () => {
        proxyServer.close();
        tlsServer.close();
      });

      beforeEach(() => {
        requests = [];
      });

      it('enables proxy based on HTTP_PROXY', async () => {
        await fakeProjectSetup({ project: { url: server.PREFIX } });
        const output = await runLocations(['--auth', apiKey], {
          HTTP_PROXY: proxyUrl,
        });
        expect(output).toContain(`custom location 1`);
        expect(requests).toHaveLength(1);
      });

      it('honors NO_PROXY with env variables', async () => {
        await fakeProjectSetup({ project: { url: server.PREFIX } });
        const output = await runLocations(['--auth', apiKey], {
          NO_PROXY: '*',
          HTTP_PROXY: proxyUrl,
        });
        expect(output).toContain(`custom location 1`);
        expect(requests).toHaveLength(0);
      });

      it('enables proxy based on HTTPS_PROXY', async () => {
        await fakeProjectSetup({ project: { url: tlsServer.PREFIX } });
        const output = await runLocations(['--auth', apiKey], {
          HTTPS_PROXY: proxyUrl,
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        });
        expect(output).toContain(`custom location 1`);
        expect(requests).toHaveLength(1);
      });

      it('enables proxy based on --proxy-uri', async () => {
        await fakeProjectSetup({ project: { url: server.PREFIX } });
        const output = await runLocations([
          '--auth',
          apiKey,
          '--proxy-uri',
          proxyUrl,
        ]);
        expect(output).toContain(`custom location 1`);
        expect(requests).toHaveLength(1);
      });

      it('enables proxy based on proxy settings', async () => {
        await fakeProjectSetup({
          project: { url: server.PREFIX },
          proxy: { uri: proxyUrl },
        });
        const output = await runLocations(['--auth', apiKey]);
        expect(output).toContain(`custom location 1`);
        expect(requests).toHaveLength(1);
      });
    });
  });
});
