# Experimental Synthetics Agent

Synthetic Monitoring with Real Browsers.
**Please note this is an unsupported experimental project. Expect things to break and change!** 

Docs are forthcoming, feel free to browse the repository, but we ask that you refrain from asking questions about use till docs
are published.

If you'd like to stay informed about synthetic monitoring development please visit [our synthetic monitoring page](https://www.elastic.co/what-is/synthetic-monitoring) where you can sign up to be notified of our initial release.

### To Run Example Jouney inline

`npm i`

`npm run build`

`npm link`

`cat examples/inline/short.js | npx @elastic/synthetics --inline`

### To Run Example Journey with Docker and hearbeat, 
Data will be pushed to ES, which can be viewed using uptime app

`node ./examples/docker/run.sh 7.10.0  -E output.elasticsearch.hosts=["http://localhost:9200"] -E output.elasticsearch.username=admin -E output.elasticsearch.password=changeme`

## CI

The CI will not run builds for collaborators PRs that are not approval by a members of Elastic org,
Elastic Users can launch the CI on PRs by putting a comment like `/test` or manually on the CI.
