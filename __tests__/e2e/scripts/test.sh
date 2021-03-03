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

# Wait for synthetics docker to start
##################################################
echo "" # newline
echo "${bold}Waiting for synthetics docker to start...${normal}"
until [ "$(docker inspect -f '{{.State.Running}}' synthetics)" == "true" ]; do
  sleep ${SLEEP_TIME};
done;

echo "✅ Setup completed successfully. Running e2e tests..."

#
# run e2e tests journey
##################################################
set +e
npx @elastic/synthetics uptime.journey.ts --reporter junit | tee tmp/reporter.out
errorLevel=$?

#
# transform reporter to junit only format
##################################################
grep -v "Waiting" tmp/reporter.out > tmp/junit.xml

exit ${errorLevel}
