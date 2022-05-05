#!/usr/bin/env bash
SYNTHETICS_E2E_ARGS=$2

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
STACK_VERSION=$1 SYNTHETICS_JUNIT_FILE="junit_$1.xml" npx @elastic/synthetics synthetics.journey.ts --reporter junit $SYNTHETICS_E2E_ARGS

status=$?

echo "Fleet server commit: \n$(docker inspect --format='{{index .Config.Labels "org.label-schema.vcs-ref"}}' elastic-package-stack_fleet-server_1)"
echo "Fetching Fleet server logs... \n"
echo $(docker logs elastic-package-stack_fleet-server_1)

echo "Elastic Agent commit: \n$(docker inspect --format='{{index .Config.Labels "org.label-schema.vcs-ref"}}' elastic-package-stack_elastic-agent_1)"
echo "Fetching Elastic Agent logs... \n"
echo $(docker logs elastic-package-stack_elastic-agent_1)

echo "Kibana commit: \n$(docker inspect --format='{{index .Config.Labels "org.opencontainers.image.revision"}}' elastic-package-stack_kibana_1)"
echo "Fetching Kibana logs... \n"
echo $(docker logs elastic-package-stack_kibana_1)

# Take the stack down
elastic-package stack down

docker rmi docker.elastic.co/beats/elastic-agent-complete:$1 docker.elastic.co/elasticsearch/elasticsearch:$1 docker.elastic.co/kibana/kibana:$1 elastic-package-stack_package-registry:latest || echo "FAILED"

exit $status
