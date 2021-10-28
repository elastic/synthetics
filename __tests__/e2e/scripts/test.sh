#!/usr/bin/env bash
set -e pipefail

# run e2e tests journey
##################################################
npx @elastic/synthetics synthetics.journey.ts --no-headless

# Take the stack down
elastic-package stack down
