#!/usr/bin/env bash
input="versions"

SYNTHETICS_E2E_ARGS="${@:2}"

while IFS= read -r line
do
    sh ./scripts/setup_integration.sh $line && sh ./scripts/$1_integration.sh $line $SYNTHETICS_E2E_ARGS
done < "$input"
