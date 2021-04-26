# Changelog

All notable changes to this project will be documented in this file.

## v1.0.0-beta.0 (2021-04-23)

### Features

- Default to JPEG images with quality 80 for individual step
  screenshots[#233](https://github.com/elastic/synthetics/issues/233)

### Bug fixes

- Keep journey callback types to be synchronous to match with how steps are
  executed synchronously[#256](https://github.com/elastic/synthetics/issues/256)
- Report correct page URL on navigation
  failures[#255](https://github.com/elastic/synthetics/issues/255)

**NOTE: Playwright version is updated to 1.10.0**

## v0.0.1-alpha14 (2021-04-14)

### Features

- Add support for custom reporters for the Synthetics runner
  [#254](https://github.com/elastic/synthetics/issues/254)

## v0.0.1-alpha13 (2021-04-08)

### Features

- Remove duplicate payload fields and keep the network fields under ECS
  [#252](https://github.com/elastic/synthetics/issues/252)

### Bug fixes

- Measure the network timings for aborted and inflight network requests
  correctly[#251](https://github.com/elastic/synthetics/pull/251)

## v0.0.1-alpha12 (2021-03-31)

### Features

- Record transfer size and resource size for all network events
  [#220](https://github.com/elastic/synthetics/issues/220)
- Report the number of journeys as part of the new `synthetics/metadata` event
  which would be used by heartbeat eventually for sharding [#247](https://github.com/elastic/synthetics/pull/247)

## v0.0.1-alpha11 (2021-03-10)

### Features

- Expose driver type information from the agent [#239](https://github.com/elastic/synthetics/pull/239)

Exposing the types allows developers to import the driver type information
directly from the synthetics package instead of using via playwright specific
packages which would result in inconsistent types (version mismatch or
browser specific types).

## v0.0.1-alpha10 (2021-03-04)

### Features

- Move all the ECS specific fields under `root_fields` [#164](https://github.com/elastic/synthetics/issues/164)
- Add support for Junit reporter [#149](https://github.com/elastic/synthetics/issues/149)
- Expose status field for `step/end` and `journey/end` [#230](https://github.com/elastic/synthetics/issues/230)

### Bug fixes

- Disable chromium sandboxing by default
  [#225](https://github.com/elastic/synthetics/issues/225)

## v0.0.1-alpha9 (2021-02-01)

### Features

- Add runtime seccomp profiler for the synthetics agent [#181](https://github.com/elastic/synthetics/issues/181)

### Bug fixes

- Exit with non-zero code when any step/journey fails [#191](https://github.com/elastic/synthetics/issues/191)
- Calculate blocking time properly for missing network data [#187](https://github.com/elastic/synthetics/issues/187)
- Preserve typescript source fails without transpiling to older JS versions [#195](https://github.com/elastic/synthetics/issues/195)
- Capture redirected requests in network timing data [#180](https://github.com/elastic/synthetics/issues/180)
