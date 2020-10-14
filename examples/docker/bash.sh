#!/bin/sh
docker run \
  -it \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../sample-app/journeys/dist:/opt/sample-app:ro" \
  --volume="$(pwd)/../elastic-docs/dist:/opt/elastic-docs:ro" \
  docker.elastic.co/observability-ci/synthetics:master-7.10.0-synthetics \
  bash
