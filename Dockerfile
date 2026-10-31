# Reproducible build environment for the plugin (used by ./docker-make and ./podman-make).
FROM node:26-bookworm AS node

FROM golang:1.26-bookworm

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 node \
    && useradd --create-home --uid 1000 --gid node --shell /bin/sh node

ENV GOTOOLCHAIN=auto

CMD ["/bin/sh"]
