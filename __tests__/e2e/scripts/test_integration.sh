#!/usr/bin/env bash
set -e

SYNTHETICS_E2E_ARGS="${@:2}"

# run e2e tests journey
##################################################
STACK_VERSION=$1 npx @elastic/synthetics synthetics.journey.ts $SYNTHETICS_E2E_ARGS

# Take the stack down
elastic-package stack down
