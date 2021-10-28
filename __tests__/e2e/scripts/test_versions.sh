#!/usr/bin/env bash
set -e

versions=(7.15.0 7.16.0-SNAPSHOT 8.0.0-SNAPSHOT)

for version in "${versions[@]}"
do
   sh ./scripts/setup.sh $version && sh ./scripts/$1.sh $version
done
