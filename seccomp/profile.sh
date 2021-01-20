# TODO: use docker syslog driver instead
service rsyslog start
# npm run build

go build -o ./build/seccomp_exec seccomp_exec.go

node ../dist/browser-service.js &
tail -f /var/log/syslog > ./build/syslog &

./build/seccomp_exec -policy=./seccomp_log_agent.yml node ../dist/cli.js ../examples/todos --ws-endpoint=ws://localhost:9322

./build/seccomp_exec -policy=./seccomp_log_agent.yml cat ../examples/inline/sample-inline-journey.js | node ../dist/cli.js --inline --ws-endpoint=ws://localhost:9322

service rsyslog stop

node parse-syslog.js ./build/syslog > synthetics_agent_profile.yml