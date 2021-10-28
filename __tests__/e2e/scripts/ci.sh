#!/usr/bin/env bash
set -eo pipefail

if [ -z "${JENKINS_URL}" ]; then
  # formatting
  bold=$(tput bold)
  normal=$(tput sgr0)
  SLEEP_TIME="0.1"
else
  SLEEP_TIME="10"
fi

# run e2e tests journey
##################################################
SYNTHETICS_JUNIT_FILE="junit_$1.xml" npx @elastic/synthetics synthetics.journey.ts --reporter junit

# Take the stack down
elastic-package stack down

docker system prune --force
