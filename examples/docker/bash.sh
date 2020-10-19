#!/bin/sh
VERSION=${1:-7.10.0}
IMAGE=docker.elastic.co/observability-ci/synthetics:master-$VERSION-synthetics
echo "Using image $IMAGE"
docker run \
  -it \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../sample-app/journeys:/opt/sample-app:ro" \
  --volume="$(pwd)/../elastic-docs:/opt/elastic-docs:ro" \
  $IMAGE \
  bash
