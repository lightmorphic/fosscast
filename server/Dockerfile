# FOSSCast app image. The app has zero runtime npm dependencies, so
# there is no install stage: the image is just Node plus our sources.
FROM node:22-alpine

WORKDIR /app

# Patch OS packages at build time.
RUN apk update && apk upgrade --no-cache

COPY package.json server.js ./
COPY lib ./lib

# Remove the npm CLI from the image: it is only needed to install
# dependencies, and we have none.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Run as the base image's own built-in non-root user.
RUN chown -R node:node /app
USER node

EXPOSE 3100
CMD ["node", "server.js"]
