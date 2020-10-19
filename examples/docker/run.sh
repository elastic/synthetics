#!/bin/sh
VERSION=${1:-7.11.0}
IMAGE=docker.elastic.co/observability-ci/synthetics:master-$VERSION-synthetics
echo "Using image $IMAGE"
docker run \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../sample-app/journeys:/opt/sample-app:ro" \
  --volume="$(pwd)/../elastic-docs:/opt/elastic-docs:ro" \
  $IMAGE \
  --strict.perms=false -e \
  -E output.elasticsearch.hosts=["localhost:9200"] \
  -E output.elasticsearch.username=elastic \
  -E output.elasticsearch.password=changeme \
  -E seccomp.enabled=false
