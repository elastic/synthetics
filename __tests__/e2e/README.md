# Elastic Synthetics integration End to End Tests

This folder contains E2E tests for the Elasic Synthetics Integration, covering the interactions between Kibana, Elasticsearch, Package Registry, Elastic Agent and the Elastic Synthetics agent.

## Prerequistes

### Node
We depend upon the version of node defined in .nvmrc in the root of this repo.

You will probably want to install a node version manager. nvm is recommended.

To install and use the correct node version with nvm, run the following command at the root of the repository.

```
nvm use
```

### Go
We depend on Go to install Elastic Package. The go version depdendency is documented by Elastic Package: https://github.com/elastic/elastic-package/blob/main/.go-version


### Elastic Package
We depend on [Elastic Package](https://github.com/elastic/elastic-package) to start up the the Elastic stack. Running the test commands will take care of installing the latest version of Elastic Package for you, but feel free to visit the Elastic Package docs for more information.

### Docker

Docker is needed to run the Stack via Elastic Package.

## Running tests locally

To run tests locally, execute the following commands from this directory.

```
$ npm install
$ npm run test:integration_all
```

Results are outputted to the console

## Running tests on ci

To run tests on ci with a junit output, excute the following commands from this directory

```
$ npm install
$ npm run test:ci_integration_all
```

Results are outputted to multiple junit files in the root of this directory. Each junit file is named `junit_[version].xml` corresponding to the individual stack version tested. For example `junit_8.0.0-SNAPSHOT.xml`. Failures should be reported if any junit file contains errors. A list of versions currently being tested is available in this directory in the `versions` file
