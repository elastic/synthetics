#!/usr/bin/env bash
set -xe

if [ -z "${JENKINS_URL}" ]; then
  # formatting
  bold=$(tput bold)
  normal=$(tput sgr0)
  SLEEP_TIME="0.1"
else
  SLEEP_TIME="10"
fi

# Wait for synthetics docker to start
##################################################
echo "" # newline
echo "${bold}Waiting for synthetics docker to start...${normal}"
until [ "$(docker inspect -f {{.State.Running}} synthetics)" == "true" ]; do
  sleep ${SLEEP_TIME};
done;

echo "✅ Setup completed successfully. Running e2e tests..."

#
# run e2e tests journey
##################################################

npx @elastic/synthetics uptime.journey.ts
