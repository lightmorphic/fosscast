# FOSSCast app image. The app has zero runtime npm dependencies, so
# there is no install stage: the image is just Node plus our sources.
# Pinned base for reproducible builds; OS packages still refresh on
# every (weekly) rebuild via apk upgrade below.
#
# The build context is the repository root, because the image carries
# the whole site - server and web assets both. Anyone pulling this
# image gets a complete, working instance with no files of their own:
# that is the point.
FROM node:22.23.2-alpine

WORKDIR /app

# Patch OS packages at build time. ffmpeg: probing episode durations
# for the feed, and making the small web copies of uploaded images
# (ffprobe and ffmpeg; podcast media is never transcoded).
RUN apk update && apk upgrade --no-cache && apk add --no-cache ffmpeg

COPY server/package.json server/server.js server/reset-password.js server/admin-login-link.js ./
COPY server/lib ./lib

# Stylesheet, fonts and icons live in the image too, so a plain
# `docker compose up -d` against the published image serves a complete
# site. A checkout can still mount its own web/ over the top.
COPY web ./web

# Remove the npm CLI from the image: it is only needed to install
# dependencies, and we have none.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# The data directory exists in the image and belongs to node, so a
# named volume mounted over it inherits that ownership instead of
# arriving as root-owned and unwritable. This is what lets a pasted
# compose file work with no chown step and no instructions.
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]

# Run as the base image's own built-in non-root user.
USER node

ENV WEB_DIR=/app/web DATA_DIR=/data
EXPOSE 3100
CMD ["node", "server.js"]
