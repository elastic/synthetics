#!/bin/sh
set -ex
TARGET=src/locations/public-locations.ts
echo '// DO NOT EDIT - UPDATE WITH `npm run build:locations`' > $TARGET
echo 'export const LocationsMap =' >> $TARGET
curl -s https://manifest.synthetics.elastic-cloud.com/v1/manifest.json | jq '.locations | to_entries | map({(.value.geo.name | split(" - ")[1] | ascii_downcase | split(" ") | join("_") ) : .key } ) | add' >> $TARGET
# Add license and other headers
npm run lint:fix
