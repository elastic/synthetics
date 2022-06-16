#!/usr/bin/env bash

# Update elastic-package
go install github.com/elastic/elastic-package@latest

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF=$1 KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1 --services "elasticsearch"

curl -X PUT "http://elastic:changeme@localhost:9200/_cluster/settings?pretty" -H 'Content-Type: application/json' -d'
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "97%"
  }
}
'

curl -X PUT "http://elastic:changeme@localhost:9200/*/_settings?expand_wildcards=all&pretty" -H 'Content-Type: application/json' -d'
{
  "index.blocks.read_only_allow_delete": null
}
'


env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF=$1 KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1 --services "elastic-agent"

status=$?

if [ $status -eq 1 ]; then
    echo "Fetching Fleet server logs... \n$(docker logs elastic-package-stack_fleet-server_1)"

    echo "Fetching Elastic Agent logs... \n$(docker logs elastic-package-stack_elastic-agent_1)"

    echo "Fetching Kibana logs... \n$(docker logs elastic-package-stack_kibana_1)"
fi

exit 0
