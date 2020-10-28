#!/bin/sh
docker pull docker.elastic.co/experimental/synthetics:7.10.0-synthetics
docker pull docker.elastic.co/experimental/synthetics:8.0.0-synthetics
docker pull docker.elastic.co/observability-ci/heartbeat:7.10.0-synthetics
docker pull docker.elastic.co/observability-ci/heartbeat:8.0.0-synthetics
