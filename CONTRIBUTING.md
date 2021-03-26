# Contributing to the Synthetics Agent

The Elastic Synthetics Agent is open source and we love to receive contributions from our community — you!

There are many ways to contribute, from writing tutorials or blog posts,
improving the documentation, submitting bug reports and feature requests or
writing code.

You can get in touch with us through [Discuss](https://discuss.elastic.co/tags/c/observability/uptime/75/synthetics)—
feedback and ideas are always welcome.

## Code contributions

If you have a bugfix or new feature that you would like to contribute,
please find or open an issue about it first. Talk about what you would like to do.
It may be that somebody is already working on it,
or that there are particular issues that you should know about before implementing the change.

### Submitting your changes

Generally, we require that you test any code you are adding or modifying.
Once your changes are ready to submit for review:

1. Sign the Contributor License Agreement

   Please make sure you have signed our [Contributor License Agreement](https://www.elastic.co/contributor-agreement/).
   We are not asking you to assign copyright to us, but to give us the right to
   distribute your code without restriction. We ask this of all contributors in
   order to assure our users of the origin and continuing existence of the code.
   You only need to sign the CLA once.

2. Test your changes

   Run the test suite to make sure that nothing is broken. If you're adding new
   code or changing existing code, write some automated tests that exercise this
   code. See [testing](#testing) for details.

3. Rebase your changes

   Update your local repository with the most recent code from the main repo,
   and rebase your branch on top of the latest master branch. We prefer your
   initial changes to be squashed into a single commit. Later, if we ask you to
   make changes, add them as separate commits. This makes it easier to review.
   As a final step before merging, we will either ask you to squash all commits
   yourself or we'll do it for you.

4. Submit a pull request

   Push your local changes to your forked copy of the repository and [submit a
   pull request](https://help.github.com/articles/using-pull-requests). In the
   pull request, choose a title that sums up the changes that you have made,
   and in the body provide more details about what your changes do. Also mention
   the number of the issue where the discussion has taken place, eg "Fixes #123".

5. Be patient

   We might not be able to review your code as fast as we would like to,
   but we'll do our best to dedicate it the attention it deserves.
   Your effort is much appreciated!

### Workflow

All feature development and most bug fixes hit the master branch first.
Pull requests should be reviewed by someone with commit access. Once approved,
the author of the pull request, or reviewer if the author does not have commit
access, should "Squash and merge".

Before submitting a pull request, please make sure to follow the below steps

1. Fork the repo and create your branch from `master`.

2. We use `npm` for running development scripts.

3. Install the project dependencies

```sh
npm install
```

4. We use [TypeScript](https://www.typescriptlang.org/), run the build step to
   transpile the code to JavaScript and also to do type checking

```sh
npm run build
```

5. You can also run in watch mode to continuously transform changed files to
   speed up the feedback loop.

```sh
npm run watch
```

6. Make sure to update documentation or add test suites wherever appropriate.
   Ensure test passes via

```sh
npm run test
```

### pre-commit

This project uses [pre-commit](https://pre-commit.com/) so, after installing it, please install the already configured pre-commit hooks we support, to enable pre-commit in your local git repository:

```shell
$ pre-commit install
pre-commit installed at .git/hooks/pre-commit
```

To understand more about the hooks we use, please take a look at pre-commit's [configuration file](./.pre-commit-config.yml).

### Testing

This project currently has both unit and integration tests.

##### Unit tests

We use [Jest](https://github.com/facebook/jest) for running tests. Unit tests
are located under the `__tests__` directory and can be run as

```sh
npm run test
```

##### Integration tests

We build the heartbeat image with the latest agent to look for any failures in
integration. Follow the below steps to invoke the synthetics agent using
heartbeat locally

1. `cd /examples/docker`
2. `./pull-latest.sh` - Pulls the latest heartbeat images
3. `./run-build-local.sh $HEARTBEAT_ARGS` - Runs the locally built heartbeat image with the
   synthetic tests configured in `heartbeat.docker.yml` file.

### Releasing

**NOTE: This project is currently in Alpha phase**

#### Manually

If you have access to publish the package to NPM, the process is as follows:

1. Be sure you have checked out the `master` branch and have pulled the latest changes
1. Run the tests to make sure everything is green
1. Bump the alpha version by running `npm version prerelease --preid=alpha`
1. Push commits and tags upstream with `git push upstream master && git push upstream --tags`
1. Publish to NPM using with `npm publish --tag alpha`
1. Mark the last published alpha tags as latest using `npm dist-tag add @elastic/synthetics@<$VERSION> latest`

#### CI based

The release process is also automated in the way any specific commit from the master branch can be potentially released, for such it's required the below steps:

1. Login to apm-ci.elastic.co
1. Go to the [master](https://apm-ci.elastic.co/job/apm-agent-rum/job/elastic-synthetics/job/master/) pipeline.
1. Click on `Build with parameters` with the below checkbox:
  * `release` to be selected.
  * other checkboxes should be left as default.
1. Click on `Build`.
1. Wait for an email or slack message to confirm the release is ready to be approved, it might take roughly 20 minutes.
1. Click on the URL from the email or slack.
1. Click on approve or abort.
1. Then you can go to the `https://www.npmjs.com/package/@elastic/synthetics` to validate that the bundles have been published.

## CI

The CI will not run builds for collaborators PRs that are not approval by a members of Elastic org,
Elastic Users can launch the CI on PRs by putting a comment like `/test` or manually on the CI.
