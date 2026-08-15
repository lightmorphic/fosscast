# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

- Project skeleton: Node app (zero runtime dependencies) serving the
  landing page, health check and version endpoints; MediaMTX ingest
  (RTMP in on 1935, HLS out on 8888) with publish authorisation
  delegated to the app via a stream key while playback stays public;
  docker-compose stack with bundled Caddy for one-command self-hosting;
  GHCR image build workflow with weekly rebuilds; release-based deploy
  and rollback scripts.
