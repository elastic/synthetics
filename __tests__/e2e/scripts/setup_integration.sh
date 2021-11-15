#!/usr/bin/env bash
set -e

# Update elastic-package
go install github.com/elastic/elastic-package@latest

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
env ELASTICSEARCH_IMAGE_REF=$1 ELASTIC_AGENT_IMAGE_REF=$1 KIBANA_IMAGE_REF=$1 elastic-package stack up -d -v --version $1
