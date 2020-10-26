#!/bin/bash
VERSION=${1:-7.10.0}
if [[ version =~ ^[0-9] ]]; then
	IMAGE=docker.elastic.co/observability-ci/synthetics:master-$VERSION-synthetics
else
	IMAGE=$VERSION
fi
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
