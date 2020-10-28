ARG STACK_VERSION=7.10.0-synthetics
FROM docker.elastic.co/observability-ci/heartbeat:${STACK_VERSION}
USER root
RUN yum -y install epel-release && \
    yum -y install atk cups gtk gdk xrandr pango.x86_64 libXcomposite.x86_64 libXcursor.x86_64 libXdamage.x86_64 \
	  libXext.x86_64 libXi.x86_64 libXtst.x86_64 cups-libs.x86_64 libXScrnSaver.x86_64 libXrandr.x86_64 GConf2.x86_64 \
	  alsa-lib.x86_64 atk.x86_64 gtk3.x86_64 ipa-gothic-fonts xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-utils \
	  xorg-x11-fonts-cyrillic xorg-x11-fonts-Type1 xorg-x11-fonts-misc \
	  yum clean all && \
    rm -rf /var/cache/yum
RUN echo /usr/share/heartbeat/.node \\
      /usr/share/heartbeat/.npm \\
      /usr/share/heartbeat/.cache \\
      /usr/share/heartbeat/.config \\
      /opt/elastic-synthetics | xargs -IDIR sh -c "mkdir DIR && chown -R heartbeat DIR"
ENV NODE_PATH=/usr/share/heartbeat/.node
USER heartbeat
RUN  cd /usr/share/heartbeat/.node \\
      && mkdir node \\
      && curl https://nodejs.org/dist/v12.18.4/node-v12.18.4-linux-x64.tar.xz | tar -xJ --strip 1 -C node
ENV PATH="/usr/share/heartbeat/.node/node/bin:$PATH"
# Install playwright first since it speeds up the install of elastic-synthetics*.tgz, since it doesn't need to re-download the
# browsers every time the code there changes
RUN npm i -g playwright-chromium
COPY elastic-synthetics-*.tgz /opt/elastic-synthetics.tgz
RUN npm install -g /opt/elastic-synthetics.tgz
ENV HEARTBEAT_SYNTHETICS_TGZ=/opt/elastic-synthetics.tgz
