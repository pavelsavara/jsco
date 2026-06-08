FROM mcr.microsoft.com/playwright:v1.59.1-noble

ARG PLAYWRIGHT_VERSION=1.59.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npm install -g n \
    && n 24 \
    && npm uninstall -g n \
    && npm cache clean --force

RUN npm install -g playwright@${PLAYWRIGHT_VERSION} \
    && playwright install chromium firefox \
    && playwright --version \
    && npm cache clean --force

RUN node --version \
    && npm --version \
    && playwright --version \
    && test -d /ms-playwright \
    && ls /ms-playwright