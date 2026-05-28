## Get started with Elastic Synthetics!

Browse the directory structure here to see an example skeleton of an [Elastic Synthetics](https://www.elastic.co/observability/synthetic-monitoring) project.
Make sure to [read the docs](https://www.elastic.co/guide/en/observability/current/monitor-uptime-synthetics.html) as well if you're unfamiliar with Elastic Synthetics.

This directory was created with the command `npx @elastic/synthetics <target-directory>`, with `<target-directory>` being the name of the directory you'd like it to make.
You can always use this command to scafold new Synthetics projects.

Key places to look:

- The `synthetics.config.ts` file contains configuration for your project.
- The `journeys` directory contains both basic and more advanced examples of using synthetics:
  - `example.journey.ts` and `advanced-example.journey.ts` are **browser journeys** that drive Chromium against a publicly hosted [Todos List](https://elastic.github.io/synthetics-demo/).
  - `api-example.journey.ts` and `advanced-api-example.journey.ts` are **API journeys** that run without a browser, hitting [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com) for a quick, runnable demonstration of multi-step API monitoring. Use these for OAuth-protected endpoints, multi-step API flows, and high-frequency lightweight checks.
- The `.github` directory contains an example github action, demonstrating the use of a CI service for automatically running tests on merges and PR creation.

To run the tests locally, use the following command:

```bash
npm run test
```

Curious to learn more? [Read the docs](https://www.elastic.co/guide/en/observability/current/monitor-uptime-synthetics.html) to learn about pushing configurations to an Elastic cloud stack and more.
