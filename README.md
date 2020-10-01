# synthetic-monitoring
Synthetic Monitoring with Real Browsers


## Development

Build the main package: `npm run build`

Run: `node dist/cli.js -s '{"homepage":"https://cloud.elastic.co"}' examples/inline/sample-inline-journey.js`

## CI

The CI will not run builds for collaborators PRs that are not approval by a members of Elastic org,
Elastic Users can launch the CI on PRs by putting a comment like `/test` or manually on the CI.