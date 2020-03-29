FROM golang:1.13

RUN apt update && \
    apt -y install build-essential npm

RUN addgroup --gid 1000 node \
    && useradd --create-home --uid 1000 --gid node --shell /bin/sh node

CMD /bin/sh
