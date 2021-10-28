#!/usr/bin/env bash
set -e

# Update elastic-package
go get github.com/elastic/elastic-package

eval "$(elastic-package stack shellinit)"

# Take the stack down
elastic-package stack down

# start elastic-package
elastic-package stack up -d -v --version $1
