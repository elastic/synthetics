[![ci](https://github.com/elastic/synthetics/actions/workflows/ci.yml/badge.svg)](https://github.com/elastic/synthetics/actions/workflows/ci.yml)
[![e2e](https://github.com/elastic/synthetics/actions/workflows/e2e.yml/badge.svg)](https://github.com/elastic/synthetics/actions/workflows/e2e.yml)

# Synthetics Agent

Synthetic Monitoring with Real Browsers.

## Usage

Install the package

```sh
npm install -g @elastic/synthetics
```

Run the suites via CLI

```
npx @elastic/synthetics [options] [dir] [files] file
```

Use `--workdir /path/to/scratch` to select a writable directory for runtime cache
files, including screenshots, and temporary push bundles. The programmatic
equivalent is
`run({ workdir: '/path/to/scratch' })`. Relative paths resolve against the current
working directory. The default is `.synthetics` in the current working directory.
Synthetics creates and removes a process-specific subdirectory (`<workdir>/<pid>`),
leaving the work directory itself intact. For pushes, use
`npx @elastic/synthetics push --workdir /path/to/scratch`; bundles are created under
`<workdir>/bundles` and that subdirectory is removed after successful bundling.
Project discovery and configuration resolution are unaffected. The caller must
provide write access for the user running Synthetics;
Synthetics does not change ownership or permissions on existing directories.

## Custom bundle loaders

When pushing, journeys are bundled with esbuild. To import file types esbuild
doesn't handle by default (e.g. `.svg`, `.txt`), map their extensions to
esbuild [loaders](https://esbuild.github.io/api/#loader) with `bundler.loader`
in `synthetics.config.ts`. The loaders apply both when journeys are run locally
and when they are bundled for `push`.

```ts
import type { SyntheticsConfig } from '@elastic/synthetics';

export default (): SyntheticsConfig => ({
  bundler: {
    loader: { '.svg': 'text' },
  },
});
```

## Browser journeys

The default `journey()` DSL launches a real Chromium browser via Playwright and
is the right choice when you want to verify user-facing flows.

```ts
import { journey, step, expect } from '@elastic/synthetics';

journey('homepage loads', ({ page, params }) => {
  step('open', async () => {
    await page.goto(params.url);
  });
  step('check title', async () => {
    expect(await page.title()).toContain('Welcome');
  });
});
```

## API journeys (no browser)

For API-only checks, use `apiJourney()`. It runs without launching a browser,
which makes it suitable for OAuth-protected endpoints, multi-step API flows,
and high-frequency lightweight monitoring.

```ts
import { apiJourney, monitor, step, expect } from '@elastic/synthetics';

apiJourney('orders API health', ({ request, params }) => {
  monitor.use({ schedule: 1, locations: ['us_east'] });

  let token: string;
  step('obtain OAuth2 token', async () => {
    const r = await request.post(`${params.authUrl}/oauth2/token`, {
      form: {
        grant_type: 'client_credentials',
        client_id: params.clientId,
        client_secret: params.clientSecret,
      },
    });
    expect(r.status()).toBe(200);
    token = (await r.json()).access_token;
  });

  step('check /orders', async () => {
    const r = await request.get(`${params.apiUrl}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status()).toBe(200);
  });
});
```

API journeys share most of the regular `journey()` surface — `step()`, `expect`,
`params`, `monitor.use()`, `apiJourney.skip` / `apiJourney.only` — and integrate
with the same `push` command. They are pushed to Kibana as `api`-type monitors.

Each API journey gets its own isolated `APIRequestContext` with an independent
cookie jar; cookies set in one journey are not visible in another. All
`playwrightOptions` (`baseURL`, `extraHTTPHeaders`, `ignoreHTTPSErrors`,
`httpCredentials`, client certificates, proxy, etc.) flow through to the
underlying Playwright API context.

Per-request network data — URL, method, status, headers, body sizes, timings,
and (for HTTPS) the peer certificate's issuer / subject / `validFrom` /
`validTo` / protocol — is captured and emitted in the same `journey/network_info`
events used by browser journeys.

## Documentation

- [Introduction](https://www.elastic.co/guide/en/observability/current/monitor-uptime-synthetics.html#monitoring-synthetics)
- [CLI Options](https://www.elastic.co/guide/en/observability/current/synthetics-command-reference.html#elastic-synthetics-command)
- [Syntax](https://www.elastic.co/guide/en/observability/current/synthetics-create-test.html#synthetics-syntax)
- [Creating a Journey](https://www.elastic.co/guide/en/observability/current/synthetics-create-test.html#synthetics-create-journey)
- [Creating a Step](https://www.elastic.co/guide/en/observability/current/synthetics-create-test.html#synthetics-create-step)
- [Running via CLI](https://www.elastic.co/guide/en/observability/current/synthetics-create-test.html#synthetics-test-suite)
- [Running via Heartbeat](https://www.elastic.co/guide/en/observability/current/synthetics-create-test.html#synthetics-inline-journey)

Complete documentation is avaiable on [elastic.co](https://www.elastic.co/guide/en/observability/current/synthetic-monitoring.html)

Have questions? Want to leave feedback? Visit the [Synthetics discussion
forum](https://discuss.elastic.co/tags/c/observability/uptime/75/synthetics).

## Contributing

Contributions are welcome, but we recommend that you take a moment and read our contribution guide first.

<sup><br>Made with ♥️ and ☕️ by Elastic and our community.</sup>
