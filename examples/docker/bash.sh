#!/bin/sh
#!/bin/bash
VERSION=${1:-7.10.0}
if [[ version =~ ^[0-9] ]]; then
	IMAGE=docker.elastic.co/observability-ci/synthetics:master-$VERSION-synthetics
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
  --volume="$(pwd)/../sample-app/journeys:/opt/sample-app:ro" \
  --volume="$(pwd)/../elastic-docs:/opt/elastic-docs:ro" \
  --volume="$(pwd)/../elastic-docs-js:/opt/elastic-docs-js:ro" \
  $IMAGE \
  bash
