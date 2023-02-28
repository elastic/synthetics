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
import { devices } from 'playwright-chromium';
import { Server } from './utils/server';
import { CLIMock } from './utils/test-config';
import {
  DEFAULT_THROTTLING_OPTIONS,
  getNetworkConditions,
  megabitsToBytes,
  safeNDJSONParse,
} from '../src/helpers';

describe('CLI', () => {
  let server: Server;
  let serverParams: { url: string };
  beforeAll(async () => {
    server = await Server.create({ tls: false });
    serverParams = { url: server.TEST_PAGE };
  });
  afterAll(async () => await server.close());

  const FIXTURES_DIR = join(__dirname, 'fixtures');

  // jest by default sets NODE_ENV to `test`
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  const getJourneyStart = output => {
    return getEvent(output, 'journey/start');
  };

  const getStepEnd = output => {
    return getEvent(output, 'step/end');
  };

  const getJourneyScriptConsole = output => {
    return getEvent(output, 'journey/scriptconsole');
  };

  const getEvent = (output, eventName) => {
    const parsedLines = output
      .split('\n')
      .filter(line => !!line)
      .map(JSON.parse);
    return parsedLines.find(e => e.type === eventName);
  };

  describe('for inline tests', () => {
    it('runs inline tests', async () => {
      const cli = new CLIMock()
        .stdin(
          `step('check h2', async () => {
          await page.goto(params.url, { timeout: 1500 });
          const sel = await page.waitForSelector('h2.synthetics', { timeout: 1500 });
          expect(await sel.textContent()).toBe("Synthetics test page");
        })`
        )
        .args(['--inline', '--params', JSON.stringify(serverParams)])
        .run();
      await cli.waitFor('Journey: inline');
      expect(await cli.exitCode).toBe(0);
    });

    it('provides request context', async () => {
      const cli = new CLIMock()
        .stdin(
          `step('check body', async () => {
          const resp = await request.get(params.url);
          expect((await resp.body()).toString()).toMatch(/Synthetics/);
        })`
        )
        .args(['--inline', '--params', JSON.stringify(serverParams)])
        .run();
      expect(await cli.exitCode).toBe(0);
    });

    it('exit with 1 on syntax errors', async () => {
      const cli = new CLIMock()
        .stdin(`step('syntax error', async () => {}})`)
        .args(['--inline', '--rich-events'])
        .run();
      expect(await cli.exitCode).toBe(1);
    });

    it('treat reference error as journey error', async () => {
      const cli = new CLIMock()
        .stdin(`apinotfound('fail', async () => {})`)
        .args(['--inline', '--rich-events'])
        .run();
      await cli.waitFor('journey/end');
      expect(cli.output()).toContain('apinotfound is not defined');
      expect(await cli.exitCode).toBe(0);
    });

    it('does not load a configuration file without a config param', async () => {
      const output = async () => {
        const cli = new CLIMock()
          .stdin(`step('fake step', async () => {})`)
          .args(['--reporter', 'json', '--inline'])
          .run({ cwd: FIXTURES_DIR });
        await cli.waitFor('journey/start');
        expect(await cli.exitCode).toBe(0);
        return getJourneyStart(cli.output());
      };

      expect((await output()).payload).not.toMatchObject({
        params: { url: 'non-dev' },
      });
      process.env['NODE_ENV'] = 'development';
      expect((await output()).payload).not.toMatchObject({
        params: { url: 'dev' },
      });
    });

    it('loads a configuration file when passing a config param', async () => {
      const output = async () => {
        const cli = new CLIMock()
          .stdin(`step('fake step', async () => {console.log(params)})`)
          .args([
            '--reporter',
            'json',
            '--inline',
            '--config',
            join(FIXTURES_DIR, 'synthetics.config.ts'),
          ])
          .run({ cwd: FIXTURES_DIR });
        await cli.waitFor('journey/scriptconsole');
        expect(await cli.exitCode).toBe(0);
        return getJourneyScriptConsole(cli.output());
      };
      expect((await output()).payload.text).toBe("{ url: 'non-dev' }");

      process.env['NODE_ENV'] = 'development';
      expect((await output()).payload.text).toBe("{ url: 'dev' }");
    });
  });

  it('run suites and exit with 0', async () => {
    const cli = new CLIMock()
      .args([join(FIXTURES_DIR, 'fake.journey.ts')])
      .run();
    await cli.waitFor('Journey: fake journey');
    expect(cli.output()).toContain('fake journey');
    expect(await cli.exitCode).toBe(0);
  });

  it('run suites and exit with 1', async () => {
    const cli = new CLIMock()
      .args([join(FIXTURES_DIR, 'error.journey.ts')])
      .run();
    await cli.waitFor('boom');
    expect(await cli.exitCode).toBe(1);
  });

  it('runs a browser test with request correctly', async () => {
    const cli = new CLIMock(false)
      .args([
        join(FIXTURES_DIR, 'browser-with-api.journey.ts'),
        '--params',
        JSON.stringify(serverParams),
      ])
      .run();
    await cli.waitFor('Journey: browser with request');
    expect(cli.output()).toContain('browser with request');
    expect(await cli.exitCode).toBe(0);
  });

  it('runs the suites with --quiet-exit-code, always exiting with 0', async () => {
    const cli = new CLIMock()
      .args([join(FIXTURES_DIR, 'error.journey.ts'), '--quiet-exit-code'])
      .run();
    await cli.waitFor('boom');
    expect(await cli.exitCode).toBe(0);
  });

  it('produce json with reporter=json flag', async () => {
    const output = async args => {
      const cli = new CLIMock()
        .args([join(FIXTURES_DIR, 'fake.journey.ts'), ...args])
        .run();
      await cli.waitFor('fake journey');
      expect(await cli.exitCode).toBe(0);
      return JSON.parse(cli.output());
    };
    expect((await output(['--reporter', 'json'])).journey).toEqual({
      id: 'fake journey',
      name: 'fake journey',
    });
  });

  it('mimick new heartbeat with `--rich-events` flag', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'example.journey.ts'),
        '--rich-events',
        '--params',
        JSON.stringify(serverParams),
      ])
      .run();
    await cli.waitFor('journey/end');
    expect(await cli.exitCode).toBe(0);

    const data = safeNDJSONParse(cli.buffer());
    const screenshotRef = data.find(
      ({ type }) => type === 'step/screenshot_ref'
    );
    expect(screenshotRef).toBeDefined();

    const networkData = data.find(
      ({ type }) => type === 'journey/network_info'
    );
    expect(networkData).toBeDefined();

    const traceData = data.find(({ type }) => type === 'step/metrics');
    expect(traceData).toBeDefined();
  });

  it('override screenshots with `--rich-events` flag', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'fake.journey.ts'),
        '--rich-events',
        '--screenshots',
        'off',
      ])
      .run();
    await cli.waitFor('journey/end');
    const screenshots = safeNDJSONParse(cli.buffer()).find(
      ({ type }) => type === 'step/screenshot_ref'
    );
    expect(screenshots).not.toBeDefined();
    expect(await cli.exitCode).toBe(0);
  });

  it('screenshots with device emulation', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'fake.journey.ts'),
        '--rich-events',
        '--config',
        join(FIXTURES_DIR, 'synthetics.config.ts'),
      ])
      .run();
    await cli.waitFor('journey/end');
    const data = safeNDJSONParse(cli.buffer(), true);
    const screenshotRef = data.find(
      ({ type }) => type === 'step/screenshot_ref'
    );
    const screenshotBlocks = data.filter(
      ({ type }) => type === 'screenshot/block'
    );
    expect(screenshotRef).toBeDefined();
    expect(screenshotBlocks.length).toBe(64);
    expect(await cli.exitCode).toBe(0);
  });

  it('pass dynamic config to journey params', async () => {
    const getJourneyStart = async () => {
      const cli = new CLIMock()
        .args([
          join(FIXTURES_DIR, 'fake.journey.ts'),
          '--reporter',
          'json',
          '--config',
          join(FIXTURES_DIR, 'synthetics.config.ts'),
        ])
        .run();
      await cli.waitFor('journey/scriptconsole');
      expect(await cli.exitCode).toBe(0);
      return cli.output();
    };

    let [output] = safeNDJSONParse([await getJourneyStart()]);
    expect(output.payload.text).toBe("{ url: 'non-dev' }");

    process.env['NODE_ENV'] = 'development';
    [output] = safeNDJSONParse([await getJourneyStart()]);
    expect(output.payload.text).toBe("{ url: 'dev' }");
  });

  it('params wins over config params', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'fake.journey.ts'),
        '--reporter',
        'json',
        '--config',
        join(FIXTURES_DIR, 'synthetics.config.ts'),
        '-p',
        '{"url": "suite-url"}',
      ])
      .run();
    await cli.waitFor('journey/scriptconsole');
    const output = getJourneyScriptConsole(cli.output());
    expect(await cli.exitCode).toBe(0);
    expect(output.payload.text).toBe("{ url: 'suite-url' }");
  });

  it('throw error on modifying params', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'params-error.journey.ts'),
        '--reporter',
        'json',
      ])
      .run();
    expect(await cli.exitCode).toBe(1);
    const [output] = safeNDJSONParse([cli.output()]);
    expect(output.error).toMatchObject({
      name: 'TypeError',
      message: 'Cannot add property foo, object is not extensible',
    });
  });

  it('support capability flag', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'example.journey.ts'),
        '--params',
        JSON.stringify(serverParams),
        '--reporter',
        'json',
        '--capability',
        'metrics',
      ])
      .run();
    await cli.waitFor('step/end');
    const output = getStepEnd(cli.output());
    expect(output.payload.pagemetrics).toBeDefined();
    expect(await cli.exitCode).toBe(0);
  });

  it('show warn for unknown capability flag', async () => {
    const cli = new CLIMock()
      .args([
        join(FIXTURES_DIR, 'fake.journey.ts'),
        '--reporter',
        'json',
        '--capability',
        'unknown',
      ])
      .run();
    try {
      await cli.exitCode;
    } catch (e) {
      expect(e.message).toMatch('Missing capability "unknown"');
    }
  });

  it('run expect assetions with type check', async () => {
    // flag turns on type checking
    process.env['TS_NODE_TYPE_CHECK'] = 'true';
    const cli = new CLIMock()
      .args([join(FIXTURES_DIR, 'expect.journey.ts')])
      .run();
    expect(await cli.exitCode).toBe(0);
    process.env['TS_NODE_TYPE_CHECK'] = 'false';
  });

  describe('TLS site with self-signed cert', () => {
    let tlsServer: Server;
    let cliArgs: Array<string>;

    beforeAll(async () => {
      tlsServer = await Server.create({ tls: true });
      cliArgs = [
        join(FIXTURES_DIR, 'example.journey.ts'),
        '--params',
        JSON.stringify({ url: tlsServer.TEST_PAGE }),
        '--reporter',
        'json',
      ];
    });

    afterAll(async () => await tlsServer.close());

    it('fails by default', async () => {
      const cli = new CLIMock().args(cliArgs).run();
      expect(await cli.exitCode).toBe(1);

      const journeyEnd = safeNDJSONParse(cli.buffer()).find(
        ({ type }) => type === 'journey/end'
      );

      expect(journeyEnd.journey).toEqual(
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('succeeds with --ignore-https-errors', async () => {
      const cli = new CLIMock()
        .args(cliArgs.concat('--ignore-https-errors'))
        .run();
      expect(await cli.exitCode).toBe(0);

      const journeyEnd = safeNDJSONParse(cli.buffer()).find(
        ({ type }) => type === 'journey/end'
      );

      expect(journeyEnd.journey).toEqual(
        expect.objectContaining({ status: 'succeeded' })
      );
    });

    it('succeeds with --playwright-options', async () => {
      const cli = new CLIMock()
        .args(
          cliArgs.concat(
            '--playwright-options',
            JSON.stringify({ ignoreHTTPSErrors: true })
          )
        )
        .run();
      expect(await cli.exitCode).toBe(0);

      const journeyEnd = safeNDJSONParse(cli.buffer()).find(
        ({ type }) => type === 'journey/end'
      );

      expect(journeyEnd.journey).toEqual(
        expect.objectContaining({ status: 'succeeded' })
      );
    });
  });

  describe('throttling', () => {
    let cliArgs: Array<string>;

    beforeAll(async () => {
      cliArgs = [
        join(FIXTURES_DIR, 'example.journey.ts'),
        '--params',
        JSON.stringify(serverParams),
        '--reporter',
        'json',
      ];
    });

    it('applies --no-throttling', async () => {
      const cli = new CLIMock().args(cliArgs.concat(['--no-throttling'])).run();
      await cli.waitFor('synthetics/metadata');
      const journeyStartOutput = JSON.parse(cli.output());
      expect(await cli.exitCode).toBe(0);
      expect(journeyStartOutput.payload).toBeUndefined();
    });

    it('applies default throttling', async () => {
      const cli = new CLIMock().args(cliArgs).run();
      await cli.waitFor('synthetics/metadata');
      const journeyStartOutput = JSON.parse(cli.output());
      expect(await cli.exitCode).toBe(0);
      expect(journeyStartOutput.payload).toHaveProperty(
        'network_conditions',
        getNetworkConditions(DEFAULT_THROTTLING_OPTIONS)
      );
    });

    it('applies custom throttling', async () => {
      const cli = new CLIMock()
        .args(
          cliArgs.concat([
            '--throttling',
            JSON.stringify({
              download: 3,
              upload: 1,
              latency: 30,
            }),
          ])
        )
        .run();
      await cli.waitFor('synthetics/metadata');
      const journeyStartOutput = JSON.parse(cli.output());
      expect(await cli.exitCode).toBe(0);
      expect(journeyStartOutput.payload).toHaveProperty('network_conditions', {
        downloadThroughput: megabitsToBytes(3),
        uploadThroughput: megabitsToBytes(1),
        latency: 30,
        offline: false,
      });
    });

    it('supports older format', async () => {
      const cli = new CLIMock()
        .args(cliArgs.concat(['--throttling', '17u/30l/3d']))
        .run();
      await cli.waitFor('synthetics/metadata');
      const journeyStartOutput = JSON.parse(cli.output());
      expect(await cli.exitCode).toBe(0);
      expect(journeyStartOutput.payload).toHaveProperty('network_conditions', {
        downloadThroughput: megabitsToBytes(3),
        uploadThroughput: megabitsToBytes(17),
        latency: 30,
        offline: false,
      });
    });

    it('uses default throttling when specific params are not provided', async () => {
      const cli = new CLIMock()
        .args(cliArgs.concat(['--throttling', JSON.stringify({ download: 2 })]))
        .run();
      await cli.waitFor('synthetics/metadata');
      const journeyStartOutput = JSON.parse(cli.output());
      expect(await cli.exitCode).toBe(0);
      expect(journeyStartOutput.payload).toHaveProperty('network_conditions', {
        ...getNetworkConditions(DEFAULT_THROTTLING_OPTIONS),
        downloadThroughput: megabitsToBytes(2),
      });
    });
  });

  describe('playwright options', () => {
    it('pass playwright options to runner', async () => {
      const cli = new CLIMock()
        .args([
          join(FIXTURES_DIR, 'pwoptions.journey.ts'),
          '--reporter',
          'json',
          '--config',
          join(FIXTURES_DIR, 'synthetics.config.ts'),
        ])
        .run();
      await cli.waitFor('step/end');
      const output = cli.output();
      expect(await cli.exitCode).toBe(0);
      expect(JSON.parse(output).step).toMatchObject({
        status: 'succeeded',
      });
    });

    it('allows overwriting playwright options with --playwright-options', async () => {
      const cli = new CLIMock()
        .args([
          join(FIXTURES_DIR, 'pwoptions.journey.ts'),
          '--reporter',
          'json',
          '--config',
          join(FIXTURES_DIR, 'synthetics.config.ts'),
          '--playwright-options',
          JSON.stringify({
            ...devices['iPad Pro 11'],
          }),
        ])
        .run();
      await cli.waitFor('step/end');
      const output = cli.output();
      expect(await cli.exitCode).toBe(1);
      expect(JSON.parse(output).step).toMatchObject({
        status: 'failed',
      });
    });
  });
});
