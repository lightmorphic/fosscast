# FOSSCast app image. The app has zero runtime npm dependencies, so
# there is no install stage: the image is just Node plus our sources.
# Pinned base for reproducible builds; OS packages still refresh on
# every (weekly) rebuild via apk upgrade below.
FROM node:22.23.2-alpine

WORKDIR /app

# Patch OS packages at build time. ffmpeg: probing episode durations
# for the feed (ffprobe; nothing is ever transcoded).
RUN apk update && apk upgrade --no-cache && apk add --no-cache ffmpeg

COPY package.json server.js reset-password.js admin-login-link.js ./
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
