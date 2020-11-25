#!/usr/bin/env bash
set -xe

# variables

# ensure Docker is running
docker ps &> /dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Please start Docker"
    exit 1
fi

if [ -z "${JENKINS_URL}" ]; then
  # formatting
  bold=$(tput bold)
  normal=$(tput sgr0)
fi

# paths
E2E_DIR="./"
TMP_DIR="tmp"

#
# Create tmp folder
##################################################
echo "" # newline
echo "${bold}Temporary folder${normal}"
echo "Temporary files will be stored in: ${E2E_DIR}${TMP_DIR}"
mkdir -p ${TMP_DIR}


echo "" # newline
echo "${bold}Starting elasticsearch , kibana and synthetics docker${normal}"
echo "" # newline

STACK_VERSION=7.10.0 docker-compose --file docker-compose.yml up --remove-orphans > ${TMP_DIR}/docker-logs.log 2>&1 &
