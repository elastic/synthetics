#!/usr/bin/env bash

# Update elastic-package
go install github.com/elastic/elastic-package@latest

echo "elastic-package version: $(elastic-package version)"

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF=$1 KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1

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

echo "Fetching ES logs... \n"
echo $(docker logs elastic-package-stack_elasticsearch_1)

echo "Disk usage..."
df -h

docker ps -a
docker stats --no-stream  --no-trunc

exit $status
