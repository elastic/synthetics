#!/bin/bash
VERSION=${1:-7.10.0}
shift # discard first arg
HEARTBEAT_ARGS=$@

if [ -z $1 ]; then
  HEARTBEAT_ARGS=-E output.elasticsearch.hosts=["localhost:9200"] \
  -E output.elasticsearch.username=elastic \
  -E output.elasticsearch.password=changeme \
else
  HEARTBEAT_ARGS = $@
fi

# Set Image based on version
if [[ $VERSION =~ ^[0-9] ]]; then
	IMAGE=docker.elastic.co/observability-ci/synthetics:master-$VERSION-synthetics
else
	IMAGE=$VERSION
fi

echo "Using image '$IMAGE' with extra args: $HEARTBEAT_ARGS"
docker run \
  --rm \
  --name=heartbeat \
  --user=heartbeat \
  --net=host \
  --security-opt seccomp=seccomp_profile.json \
  --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
  --volume="$(pwd)/../:/opt/examples:ro" \
  $IMAGE \
  --strict.perms=false -e \
  $@