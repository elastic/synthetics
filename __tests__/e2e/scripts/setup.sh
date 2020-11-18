#!/usr/bin/env bash

# variables

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
E2E_DIR="./"
TMP_DIR="tmp"
DOCKER_DIR="../../examples/docker/"
DOCKER_TO_E2E="../../__tests__/e2e"

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

cd ${DOCKER_DIR} || exit

./run.sh 7.10.0 \
    -E output.elasticsearch.hosts=["localhost:9200"] \
     > ${DOCKER_TO_E2E}/tmp/synthetics.log 2>&1 &

## go back to e2e
cd ${DOCKER_TO_E2E} || exit

echo "" # newline
echo "${bold}Starting elasticsearch and kibana${normal}"
echo "" # newline

STACK_VERSION=7.10.0 docker-compose --file docker-compose.yml up --remove-orphans > ${TMP_DIR}/docker-logs.log 2>&1 &

