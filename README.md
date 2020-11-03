# Experimental Synthetics Agent

Synthetic Monitoring with Real Browsers.
**Please note this is an unsupported experimental project. Expect things to break and change!**

Docs are forthcoming, feel free to browse the repository, but we ask that you refrain from asking questions about use till docs
are published.

If you'd like to stay informed about synthetic monitoring development please
visit [our synthetic monitoring
page](https://www.elastic.co/what-is/synthetic-monitoring) where you can sign up
to be notified of our initial release.

## Installation

```
npm install @elastic/synthetics or yarn add @elastic/synthetics
```

## CLI

```
Usage: npx synthetics [options] [dir] [files] file

Run synthetic tests

Options:
  -s, --suite-params <jsonstring>  Variables (default: "{}")
  -e, --environment <envname>      e.g. production (default: "development")
  -j, --json                       output newline delimited JSON
  -d, --debug                      print debug logs info
  --pattern <pattern>              RegExp file patterns to search inside directory
  --inline                         Run inline journeys from heartbeat
  -r, --require <modules...>       module(s) to preload
  --no-headless                    run browser in headful mode
  --screenshots                    take screenshots between steps (only shown in some reporters)
  --network                        capture all network information for all steps
  --metrics                        capture performance metrics for each step
  --dry-run                        don't actually execute anything, report only registered journeys
  --journey-name <name>            only run the journey with the given name
  --outfd <fd>                     specify a file descriptor for logs. Default is stdout
  -V, --version                    output the version number
  -h, --help                       display help for command
```

## API

```ts
import { journey, step, beforeAll, afterAll } from '@elastic/synthetics';

let server;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => {
  server.close();
});

journey('Basic journey', async ({ page }) => {
  step('visit server homepage', async () => {
    await page.goto(server.url);
  });
});
```

##### journey(name, ({ page, browser, client, params }) => {})

---

Creates a journey and also grants a fresh playwright browser, context
and page instance.

##### step(name, callback)

---

Create a step as part of the multi step journey which will be invoked in the
order they are registered as part of the journey

##### beforeAll(callback)

---

Provides a way to set up something before starting the whole journey.

## CI

The CI will not run builds for collaborators PRs that are not approval by a members of Elastic org,
Elastic Users can launch the CI on PRs by putting a comment like `/test` or manually on the CI.
