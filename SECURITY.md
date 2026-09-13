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

- **Network surface**: the only public ports are 80/443 (the reverse
  proxy). The app binds to loopback and is only reachable through the
  proxy.
- **Admin authentication**: scrypt password hashing, HMAC-signed
  HttpOnly session cookies (`Secure` behind HTTPS, `SameSite=Lax`),
  per-IP login rate limiting with lockout. The first admin account
  bootstraps from the environment only while no accounts exist. Viewers
  never need accounts, so the app stores no viewer data.
- **App**: plain Node with zero runtime npm dependencies, so the
  server supply chain is Node itself. The container runs as a non-root
  user with the npm CLI removed from the image, read-only filesystem,
  all capabilities dropped.
- **Publish API**: token-authenticated (constant-time comparison);
  pushed episodes arrive as drafts for review.
