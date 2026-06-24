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

import { CliArgs } from '../src/common_types';
import {
  collectOpts,
  normalizeOptions,
  parseFileOption,
  parsePlaywrightOptions,
} from '../src/options';
import { join } from 'path';

describe('options', () => {
  it('normalize', async () => {
    const cliArgs: CliArgs = {
      params: {
        foo: 'bar',
      },
      playwrightOptions: {
        headless: false,
      },
      sandbox: false,
      screenshots: 'on',
      dryRun: true,
      match: 'check*',
      pauseOnError: true,
      config: join(__dirname, 'fixtures', 'synthetics.config.ts'),
    };
    expect(await normalizeOptions({})).toMatchObject({
      environment: 'test',
      params: {},
      screenshots: 'on',
    });
    expect(await normalizeOptions(cliArgs)).toMatchObject({
      dryRun: true,
      environment: 'test',
      grepOpts: { match: 'check*' },
      params: {
        foo: 'bar',
        url: 'non-dev',
      },
      pauseOnError: true,
      playwrightOptions: {
        chromiumSandbox: false,
        defaultBrowserType: 'chromium',
        deviceScaleFactor: 4.5,
        hasTouch: true,
        headless: false,
        ignoreHTTPSErrors: undefined,
        isMobile: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Mobile Safari/537.36',
        viewport: {
          height: 658,
          width: 320,
        },
      },
      screenshots: 'on',
    });
  });

  it('normalize monitor configs', async () => {
    const config = join(__dirname, 'fixtures', 'synthetics.config.ts');
    expect(await normalizeOptions({ config }, 'push')).toMatchObject({
      screenshots: 'off',
      schedule: 10,
      privateLocations: ['test-location'],
      locations: ['us_east'],
      alert: {
        status: {
          enabled: true,
        },
        tls: {
          enabled: false,
        },
      },
      fields: {
        fromConfig: 'website',
      },
    });

    expect(
      await normalizeOptions(
        {
          config,
          schedule: 3,
          screenshots: 'only-on-failure',
          locations: ['australia_east'],
          privateLocations: ['test'],
          fields: {
            env: 'dev',
          },
        },
        'push'
      )
    ).toMatchObject({
      screenshots: 'only-on-failure',
      schedule: 3,
      privateLocations: ['test'],
      tags: ['foo', 'bar'],
      locations: ['australia_east'],
      alert: {
        status: {
          enabled: true,
        },
        tls: {
          enabled: false,
        },
      },
      fields: {
        env: 'dev',
      },
    });
  });

  it('cli arg headless override playwright headless arg', async () => {
    const cliArgs: CliArgs = {
      playwrightOptions: {
        headless: true,
      },
      headless: false,
    };
    expect(await normalizeOptions(cliArgs)).toMatchObject({
      playwrightOptions: {
        headless: false,
      },
    });
  });

  it('cli arg headless default value is overridden by config file', async () => {
    const cliArgs: CliArgs = {
      playwrightOptions: {
        headless: false,
      },
      headless: true,
    };
    expect(await normalizeOptions(cliArgs)).toMatchObject({
      playwrightOptions: {
        headless: false,
      },
    });
  });

  it('parses cli playwrightOptions.clientCertificates', async () => {
    const test = {
      clientCertificates: [
        {
          key: Buffer.from('This should be revived'),
          cert: Buffer.from('This should be revived'),
          pfx: Buffer.from('This should be revived'),
          origin: Buffer.from('This should not be revived'),
          passphrase: Buffer.from('This should not be revived'),
        },
        {
          key: 'This should be revived',
          cert: 'This should be revived',
          pfx: 'This should be revived',
          origin: 'This should not be revived',
          passphrase: 'This should not be revived',
        },
      ],
    };
    const result = parsePlaywrightOptions(JSON.stringify(test));

    result.clientCertificates.forEach(t => {
      expect(Buffer.isBuffer(t.cert)).toBeTruthy();
      expect(Buffer.isBuffer(t.key)).toBeTruthy();
      expect(Buffer.isBuffer(t.pfx)).toBeTruthy();
      expect(Buffer.isBuffer(t.origin)).toBeFalsy();
      expect(Buffer.isBuffer(t.passphrase)).toBeFalsy();
    });
  });

  describe('clientCertificates validation (#1123)', () => {
    const withCerts = (clientCertificates: any) =>
      normalizeOptions(
        { playwrightOptions: { clientCertificates } } as CliArgs,
        'run'
      );

    it('rejects an empty clientCertificates entry', async () => {
      await expect(withCerts([{}])).rejects.toThrow(/clientCertificates/);
    });

    it('rejects entries without an origin', async () => {
      await expect(
        withCerts([{ cert: Buffer.from('c'), key: Buffer.from('k') }])
      ).rejects.toThrow(/origin/);
    });

    it('rejects entries without any certificate material', async () => {
      await expect(
        withCerts([{ origin: 'https://test.example.com' }])
      ).rejects.toThrow(/cert|pfx/);
    });

    it('accepts a valid inline clientCertificates entry', async () => {
      await expect(
        withCerts([
          {
            origin: 'https://test.example.com',
            cert: Buffer.from('c'),
            key: Buffer.from('k'),
          },
        ])
      ).resolves.toMatchObject({
        playwrightOptions: { clientCertificates: expect.any(Array) },
      });
    });

    it('accepts a structurally valid path-based entry (existence checked at runtime)', async () => {
      await expect(
        withCerts([
          {
            origin: 'https://test.example.com',
            certPath: '/etc/mtls/cert.crt',
            keyPath: '/etc/mtls/cert.key',
          },
        ])
      ).resolves.toBeDefined();
    });
  });

  describe('parseFileOption', () => {
    it('parses file', () => {
      expect(
        parseFileOption('test')(
          join(__dirname, 'fixtures', 'synthetics.config.ts')
        )
      ).toBeInstanceOf(Buffer);
    });
    it('parses string', () => {
      expect(parseFileOption('test')('test')).toEqual('test');
    });
  });

  describe('collectOpts', () => {
    it('collects options in the accumulator', () => {
      const opts = { a: 'a', b: 'b', c: true };
      const result = {};
      Object.entries(opts).forEach(([key, value]) => {
        collectOpts(key, result)(value);
      });

      expect(result).toEqual(opts);
    });
  });
});
