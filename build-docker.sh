#!/bin/sh
echo "Building docker image..."
npm i
npm run build
npm pack
docker build . -t heartbeat-synthetics
