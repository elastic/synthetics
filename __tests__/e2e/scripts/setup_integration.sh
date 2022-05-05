#!/usr/bin/env bash

# Update elastic-package
go install github.com/elastic/elastic-package@latest

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF=$1 KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1

status=$?

echo "Fetching Fleet server logs... \n$(docker logs elastic-package-stack_fleet-server_1)"

echo "Fetching Elastic Agent logs... \n$(docker logs elastic-package-stack_elastic-agent_1)"

echo "Fetching Kibana logs... \n$(docker logs elastic-package-stack_kibana_1)"

exit $status
