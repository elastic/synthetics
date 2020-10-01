#!/bin/sh
docker run \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../sample-app/journeys/dist:/opt/sample-app:ro" \
  --volume="$(pwd)/../elastic-docs/dist:/opt/elastic-docs:ro" \
  heartbeat-synthetics \
  --strict.perms=false -e \
  -E output.elasticsearch.hosts=["localhost:9200"] \
  -E output.elasticsearch.username=elastic \
  -E output.elasticsearch.password=changeme \
