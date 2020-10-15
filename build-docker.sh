#!/bin/sh
STACK_VERSION=${1:-7.10.0-synthetics}
echo "Building docker image based on ${STACK_VERSION}..."
npm i
npm run build
npm pack
docker build . -t heartbeat-synthetics-local --build-arg STACK_VERSION=$STACK_VERSION