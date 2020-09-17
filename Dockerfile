FROM docker.elastic.co/beats/heartbeat:8.0.0
USER root
RUN yum -y update
RUN yum -y install epel-release
RUN curl -sL https://rpm.nodesource.com/setup_10.x | bash -
RUN yum -y install nodejs 
COPY elastic-synthetics-0.0.1.tgz /opt/elastic-synthetics.tgz
RUN npm install -g /opt/elastic-synthetics.tgz
