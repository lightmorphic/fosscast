# FOSSCast app image. The app has zero runtime npm dependencies, so
# there is no install stage: the image is just Node plus our sources.
FROM node:22-alpine

WORKDIR /app

# Patch OS packages at build time. ffmpeg: concatenating live
# recordings into episodes and probing durations (never transcoding).
RUN apk update && apk upgrade --no-cache && apk add --no-cache ffmpeg

COPY package.json server.js ./
COPY lib ./lib

# The recordings volume is written by MediaMTX (root) and read by us;
# the media dir is ours. Both live under /data owned by node.

# Remove the npm CLI from the image: it is only needed to install
# dependencies, and we have none.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Run as the base image's own built-in non-root user.
RUN chown -R node:node /app
USER node

EXPOSE 3100
CMD ["node", "server.js"]
