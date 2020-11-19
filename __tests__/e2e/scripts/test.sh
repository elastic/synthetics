#!/usr/bin/env bash
set -e


# formatting
bold=$(tput bold)
normal=$(tput sgr0)


# Wait for synthetics docker to start
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


