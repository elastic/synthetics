#!/usr/bin/env bash
set -e

# variables
KIBANA_PORT=5601

# ensure Docker is running
docker ps &> /dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Please start Docker"
    exit 1
fi

# formatting
bold=$(tput bold)
normal=$(tput sgr0)

# Wait for Kibana to start
##################################################
echo "" # newline
echo "${bold}Waiting for Kibana to start...${normal}"
yarn wait-on -i 500 -w 500 http-get://admin:changeme@localhost:$KIBANA_PORT/api/status > /dev/null


# Wait for Heartbeat docker to start
##################################################
echo "" # newline
echo "${bold}Waiting for synthetics docker to start...${normal}"
until [ "`docker inspect -f {{.State.Running}} synthetics`" == "true" ]; do
    sleep 0.1;
done;

echo "✅ Setup completed successfully. Running e2e tests..."

#
# run e2e tests journey
##################################################

npx @elastic/synthetics uptime.journey.ts


