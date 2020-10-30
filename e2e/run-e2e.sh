#!/usr/bin/env bash

# variables
KIBANA_PORT=5601
ELASTICSEARCH_PORT=9201

# ensure Docker is running
docker ps &> /dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Please start Docker"
    exit 1
fi

# formatting
bold=$(tput bold)
normal=$(tput sgr0)

# paths
E2E_DIR="${0%/*}"
TMP_DIR="tmp"
APM_IT_DIR="tmp/apm-integration-testing"
DOCKER_DIR="../examples/docker/"

cd ${E2E_DIR}

KIBANA_VERSION=7.10.0

#
# Create tmp folder
##################################################
echo "" # newline
echo "${bold}Temporary folder${normal}"
echo "Temporary files will be stored in: ${E2E_DIR}${TMP_DIR}"
mkdir -p ${TMP_DIR}


# Start synthetics docker examples
echo "" # newline
echo "${bold}Starting synthetics docker examples${normal}"
echo "" # newline
cd ${DOCKER_DIR}

./run.sh 7.10.0 \
    -E output.elasticsearch.hosts=["localhost:9201"] \
    -E output.elasticsearch.username=admin \
    -E output.elasticsearch.password=changeme \
     > ../../e2e/tmp/synthetics.log 2>&1 &

cd ../../e2e/

#
# apm-integration-testing
##################################################
echo "" # newline
echo "${bold}apm-integration-testing (logs: ${E2E_DIR}${TMP_DIR}/apm-it.log)${normal}"


# pull if folder already exists
if [ -d ${APM_IT_DIR} ]; then
    echo "Pulling from master..."
    git -C ${APM_IT_DIR} pull &> ${TMP_DIR}/apm-it.log

# clone if folder does not exists
else
    echo "Cloning repository"
    git clone "https://github.com/elastic/apm-integration-testing.git" ${APM_IT_DIR} &> ${TMP_DIR}/apm-it.log
fi

# Stop if clone/pull failed
if [ $? -ne 0 ]; then
    echo "⚠️  Initializing apm-integration-testing failed."
    exit 1
fi
\

# Start apm-integration-testing
echo "Starting docker-compose"
echo "Using stack version: ${KIBANA_VERSION}"
${APM_IT_DIR}/scripts/compose.py start $KIBANA_VERSION \
    --no-apm-server \
    --elasticsearch-port $ELASTICSEARCH_PORT \
    --elasticsearch-heap 4g \
    &> ${TMP_DIR}/apm-it.log

# Stop if apm-integration-testing failed to start correctly
if [ $? -ne 0 ]; then
    echo "⚠️  apm-integration-testing could not be started"
    echo "" # newline
    echo "As a last resort, reset docker with:"
    echo "" # newline
    echo "cd ${E2E_DIR}${APM_IT_DIR} && scripts/compose.py stop && docker system prune --all --force --volumes"
    echo "" # newline

    # output logs for excited docker containers
    cd ${APM_IT_DIR} && docker-compose ps --filter "status=exited" -q | xargs -L1 docker logs --tail=10 && cd -

    echo "" # newline
    echo "Find the full logs in ${E2E_DIR}${TMP_DIR}/apm-it.log"
    exit 1
fi


# Wait for Kibana to start
##################################################
echo "" # newline
echo "${bold}Waiting for Kibana to start...${normal}"
yarn wait-on -i 500 -w 500 http-get://admin:changeme@localhost:$KIBANA_PORT/api/status > /dev/null


# Wait for Heartbeat docker to start
##################################################
echo "" # newline
echo "${bold}Waiting for Heartbeat docker to start...${normal}"
until [ "`docker inspect -f {{.State.Running}} heartbeat`" == "true" ]; do
    sleep 0.1;
done;

echo "✅ Setup completed successfully. Running e2e tests..."

#
# run e2e tests journey
##################################################



npx @elastic/synthetics uptime.journey.ts


if [ $? == 1 ]; then
   echo "✅ Tests Succeeded"
fi

if [ $? == 0 ]; then
  echo  "⚠️  Tests failed."
fi


e2e_status=$?


# Report the e2e status at the very end
if [ $e2e_status -ne 0 ]; then
    echo "⚠️  Running tests failed."
    exit 1
fi
