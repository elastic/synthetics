SYNTHETICS_E2E_ARGS="${@:2}"

#!/usr/bin/env bash
set -e pipefail

# run e2e tests journey
##################################################
npx @elastic/synthetics synthetics.journey.ts $SYNTHETICS_E2E_ARGS

# Take the stack down
elastic-package stack down
