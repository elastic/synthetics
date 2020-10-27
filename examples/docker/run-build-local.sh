#!/bin/bash
# Build a local docker image using the latest source in this repo
# and run heartbeat with the config in this directory
pushd ../../
./build-docker.sh $1
popd
./run.sh heartbeat-synthetics-local
