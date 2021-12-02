#!/usr/bin/env bash
set -e

SYNTHETICS_E2E_ARGS="${@:2}"

# run e2e tests journey
##################################################
SYNTHETICS_JUNIT_FILE="junit_$1.xml" npx @elastic/synthetics synthetics.journey.ts --reporter junit $SYNTHETICS_E2E_ARGS

# Take the stack down
elastic-package stack down

docker rmi docker.elastic.co/beats/elastic-agent-complete:$1 docker.elastic.co/elasticsearch/elasticsearch:$1 docker.elastic.co/kibana/kibana:$1 elastic-package-stack_package-registry:latest
