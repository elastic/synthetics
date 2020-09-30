FROM docker.elastic.co/beats/heartbeat:8.0.0
USER root
RUN yum -y update && \
    yum -y install epel-release && \
    yum -y localinstall --nogpgcheck https://download1.rpmfusion.org/free/el/rpmfusion-free-release-7.noarch.rpm && \
    yum -y install ffmpeg atk cups gtk gdk xrandr pango.x86_64 libXcomposite.x86_64 libXcursor.x86_64 libXdamage.x86_64 \
	  libXext.x86_64 libXi.x86_64 libXtst.x86_64 cups-libs.x86_64 libXScrnSaver.x86_64 libXrandr.x86_64 GConf2.x86_64 \
	  alsa-lib.x86_64 atk.x86_64 gtk3.x86_64 ipa-gothic-fonts xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-utils \
	  xorg-x11-fonts-cyrillic xorg-x11-fonts-Type1 xorg-x11-fonts-misc
RUN echo /usr/share/heartbeat/.node \\
      /usr/share/heartbeat/.npm \\
      /usr/share/heartbeat/.cache \\
      /usr/share/heartbeat/.config \\
      /opt/elastic-synthetics | xargs -IDIR sh -c "mkdir DIR && chown -R heartbeat DIR"
ENV NODE_PATH=/usr/share/heartbeat/.node
USER heartbeat
RUN curl https://nodejs.org/dist/v12.18.4/node-v12.18.4-linux-x64.tar.xz -o /usr/share/heartbeat/.node/node.tar.gz && \
cd /usr/share/heartbeat/.node && \
 tar -xf node.tar.gz && \
mv node-v* node
ENV PATH="/usr/share/heartbeat/.node/node/bin:$PATH"
RUN npm i -g playwright
COPY elastic-synthetics*.tgz /opt/elastic-synthetics.tgz
RUN npm install -g /opt/elastic-synthetics.tgz \\
      && rm /opt/elastic-synthetics.tgz