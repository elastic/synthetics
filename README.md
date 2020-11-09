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

journey('Basic journey', async ({ page, browser }) => {
  step('visit server homepage', async () => {
    await page.goto(server.url);
  });
});
```

##### journey(name, ({ page, browser, client, params }) => {})

---

Creates a journey and also grants a fresh playwright browser, context
and page instance.

##### step(name, function)

---

Create a step as part of the multi step journey which will be invoked in the
order they are registered as part of the journey

##### beforeAll(function)

---

Provide a function that will be called before any of the journey runs. If the
provided function is a promise, the runner waits for the promise to resolve
before invoking the journey. Useful when setting up global state/server that
will be used multiple journeys.

##### afterAll(function)

---

Runs the provided function after all the journeys have completed. Useful for
removing the global state/closing the server in the tests.

##### before(function)

---

Runs a function before invoking any of the steps that are registered as part of
the journey. Useful for setting up local state that is part of a single
journey.

##### after(function)

---

Runs a function after all the steps in a journey gets completed. Useful for
removing the local state.

## CI

The CI will not run builds for collaborators PRs that are not approval by a members of Elastic org,
Elastic Users can launch the CI on PRs by putting a comment like `/test` or manually on the CI.
