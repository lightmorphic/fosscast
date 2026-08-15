# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub's private vulnerability reporting](https://github.com/lightmorphic/fosscast/security/advisories/new)
on this repository. You'll get a response as soon as possible, normally
within a few days. Please don't open public issues for security
problems before they're fixed.

## Supported versions

Only the latest release (what `main` deploys) is supported. FOSSCast is
self-hosted: run the newest version.

## Security design notes

For self-hosters assessing the project:

- **Streaming ingest**: every RTMP publish attempt is authorised by the
  app before MediaMTX accepts it; without a valid stream key nothing
  can go live. Playback is deliberately public. RTSP, WebRTC, SRT and
  MoQ are disabled outright, as are MediaMTX's API, metrics and pprof
  endpoints.
- **Network surface**: the only public ports are 80/443 (the reverse
  proxy) and 1935 (RTMP ingest). The app and the HLS output bind to
  loopback and are only reachable through the proxy.
- **App**: plain Node with zero runtime npm dependencies, so the supply
  chain is Node itself. The container runs as a non-root user with the
  npm CLI removed from the image.
- **Publish API** (under construction) will be token-authenticated;
  viewers never need accounts in v1, so the app stores no passwords.
