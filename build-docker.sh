#!/bin/sh
echo "Building docker image..."
npm i
npm run build
npm pack
docker build . -t heartbeat-synthetics --build-arg "STACK_VERSION=4bcb5922f279464a889c7b394d5e8dc3475ca84f"
