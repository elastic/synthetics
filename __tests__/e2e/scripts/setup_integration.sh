#!/usr/bin/env bash

# Update elastic-package
go install github.com/elastic/elastic-package@latest

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
# elastic-package always resolves the plain (non-"complete") elastic-agent-wolfi
# image for stack up on modern versions, which can't run browser monitors
# ("cannot be created outside the official elastic docker image"). Force the
# complete image via the one override elastic-package actually honors for
# this command -- ELASTIC_AGENT_IMAGE_REF alone is ignored here. The
# "complete" image moved from the "beats" to the "elastic-agent" registry
# namespace at 8.2.0, so pick the namespace that actually has a manifest.
version_core="${1%%-*}"
major="${version_core%%.*}"
minor="${version_core#*.}"
minor="${minor%%.*}"
if [ "$major" -lt 8 ] || { [ "$major" -eq 8 ] && [ "$minor" -lt 2 ]; }; then
  agent_complete_image="docker.elastic.co/beats/elastic-agent-complete:$1"
else
  agent_complete_image="docker.elastic.co/elastic-agent/elastic-agent-complete:$1"
fi

env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF_OVERRIDE="$agent_complete_image" KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1 --services "elasticsearch"

curl -k -X PUT "https://elastic:changeme@localhost:9200/_cluster/settings?pretty" -H 'Content-Type: application/json' -d'
{
    "persistent" : {
      "cluster.routing.allocation.disk.threshold_enabled" : false
    }
}
'

env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF_OVERRIDE="$agent_complete_image" KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1 --services "elastic-agent"

status=$?

if [ $status -eq 1 ]; then
    echo "Fetching Fleet server logs... \n$(docker logs elastic-package-stack_fleet-server_1)"

    echo "Fetching Elastic Agent logs... \n$(docker logs elastic-package-stack_elastic-agent_1)"

    echo "Fetching Kibana logs... \n$(docker logs elastic-package-stack_kibana_1)"
fi

exit 0
