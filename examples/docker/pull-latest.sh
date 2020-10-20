#!/bin/sh
docker pull docker.elastic.co/observability-ci/synthetics:master-7.10.0-synthetics
docker pull docker.elastic.co/observability-ci/synthetics:master-8.0.0-synthetics
docker pull  docker.elastic.co/observability-ci/heartbeat:7.10.0-synthetics
docker pull  docker.elastic.co/observability-ci/heartbeat:8.0.0-synthetics
