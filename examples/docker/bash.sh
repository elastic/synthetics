#!/usr/bin/env bash
VERSION=${1:-8.0.0-SNAPSHOT}
IMAGE="docker.elastic.co/beats/heartbeat:${VERSION}"
echo "Using image ${IMAGE}"
docker run \
  -it \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../../:/opt/elastic-synthetics:rw" \
  "${IMAGE}" \
  bash
