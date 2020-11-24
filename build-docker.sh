#!/bin/sh
set -e
set -x
STACK_VERSION=${1:-7.10.0}
echo "Installing package dependencies for running local build"
npm i
echo "Building docker image based on ${STACK_VERSION}..."
docker build . -t heartbeat-synthetics-local --build-arg STACK_VERSION=$STACK_VERSION-synthetics
