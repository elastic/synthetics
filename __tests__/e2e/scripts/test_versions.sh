#!/usr/bin/env bash
set -e

input="versions"

while IFS= read -r line
do
  sh ./scripts/setup.sh $line && sh ./scripts/$1.sh $line
done < "$input"
