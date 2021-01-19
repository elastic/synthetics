FROM mcr.microsoft.com/playwright

USER root
RUN apt-get update
RUN apt-get -y install rsyslog

RUN apt-get -y install golang
RUN go get github.com/elastic/go-seccomp-bpf github.com/elastic/go-ucfg/yaml

COPY ./ /home/synthetics
WORKDIR /home/synthetics

RUN npm install
RUN npm run build