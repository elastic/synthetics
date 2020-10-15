#!/bin/sh

# start the ruby app with logs
/usr/bin/env mkdir -p logs
/usr/bin/env ruby app.rb > logs/app.log 2>logs/app.error.log
