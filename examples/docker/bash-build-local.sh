#!/bin/bash
# Build a local docker image using the latest source in this repo
# and run a bash prompty on the container 
pushd ../../
./build-docker.sh
popd
./bash.sh heartbeat-synthetics-local
