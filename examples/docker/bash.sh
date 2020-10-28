#!/bin/bash
VERSION=${1:-7.10.0}
if [[ version =~ ^[0-9] ]]; then
	IMAGE=docker.elastic.co/experimental/synthetics:$VERSION-synthetics
else
	IMAGE=$VERSION
fi
echo "Using image $IMAGE"
docker run \
  -it \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../:/opt/examples:rw" \
  $IMAGE \
  bash
