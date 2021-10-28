#!/usr/bin/env bash
set -e

input="versions"

while IFS= read -r line
do
  sh ./scripts/setup_integration.sh $line && sh ./scripts/$1_integration.sh $line
done < "$input"
