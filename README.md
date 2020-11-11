# Experimental Synthetics Agent

Synthetic Monitoring with Real Browsers.
**Please note this is an unsupported experimental project. Expect things to break and change!**

## Usage

Install the package

```sh
npm install -g @elastic/synthetics
```

Run the suites via CLI

```
npx synthetics [options] [dir] [files] file

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

## Documentation

Documentation is avaiable on [elastic.co](https://www.elastic.co/guide/en/observability/current/synthetic-monitoring.html)

Have questions? Want to leave feedback? Visit the [Synthetics discussion
forum](https://discuss.elastic.co/tags/c/observability/uptime/75/synthetics).

## Contributing

Contributions are welcome, but we recommend that you take a moment and read our contribution guide first.

<sup><br>Made with ♥️ and ☕️ by Elastic and our community.</sup>
