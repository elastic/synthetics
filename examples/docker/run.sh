#!/usr/bin/env bash
set -ex
VERSION=${1:-7.11.0}
if [ -n "${1}" ]; then
  shift # discard first arg
fi

if [ -z "${1}" ]; then
  HEARTBEAT_ARGS="-E output.elasticsearch.hosts=[\"localhost:9200\"] -E output.elasticsearch.username=elastic -E output.elasticsearch.password=changeme"
else
  HEARTBEAT_ARGS="$*"
fi

MAJOR=7
# Set Image based on version
if [[ ${VERSION} =~ ^8 ]]; then
  MAJOR=8
  IMAGE="docker.elastic.co/beats/heartbeat:$VERSION-SNAPSHOT"
elif [[ ${VERSION} =~ ^[0-9] ]]; then
	IMAGE="docker.elastic.co/experimental/synthetics:${VERSION}-synthetics"
else
	IMAGE=${VERSION}
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "Using image '${IMAGE}' with extra args: ${HEARTBEAT_ARGS}"
if [[ ${MAJOR} = "7" ]]; then
  docker run \
    --rm \
    --name=heartbeat \
    --user=heartbeat \
    --net=host \
    --security-opt seccomp="${SCRIPT_DIR}"/seccomp_profile.json \
    --volume="$(pwd)/heartbeat.docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
    --volume="$(pwd)/../../:/opt/elastic-synthetics:rw" \
    "${IMAGE}" \
    --strict.perms=false -e \
    ${HEARTBEAT_ARGS}
else
  echo "Detected major version >7"
  docker run \
    --rm \
    --name=heartbeat \
    --user=heartbeat \
    --net=host \
    --security-opt seccomp="${SCRIPT_DIR}"/seccomp_profile.json \
    --volume="$(pwd)/heartbeat-8.0.0-docker.yml:/usr/share/heartbeat/heartbeat.yml:ro" \
    --volume="$(pwd)/../../:/opt/elastic-synthetics:ro" \
    "${IMAGE}" \
    --strict.perms=false -e \
    ${HEARTBEAT_ARGS}
fi