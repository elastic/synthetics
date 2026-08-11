import type { SyntheticsConfig } from '@elastic/synthetics';

/**
 * Example configuration that lets a browser monitor reach an internal HTTPS
 * site whose certificate is issued by a private / internal Certificate
 * Authority (CA) by allowlisting the server certificate's SPKI.
 *
 * Why this is needed:
 *
 *   Chromium on Linux validates server certificates against its own NSS trust
 *   store rather than the operating system store. That means dropping your
 *   internal root CA into `/etc/ssl/certs` (or installing it on the host) is
 *   NOT enough — Chromium still reports `ERR_CERT_AUTHORITY_INVALID`. Until now
 *   the only workarounds were rebuilding the agent image with the CA baked in
 *   or turning off validation entirely with `ignoreHTTPSErrors`.
 *
 * What `certificateErrorSpkiAllowlist` does:
 *
 *   This option does not add a CA to Chromium's trust store. The Synthetics
 *   runner computes the SHA-256 SPKI fingerprint of each certificate you pass
 *   here and forwards it to Chromium via
 *   `--ignore-certificate-errors-spki-list`. Chromium then bypasses certificate
 *   errors only when a presented certificate has a matching public key. This is
 *   narrower than `ignoreHTTPSErrors`, but it is not CA trust.
 *
 * Each entry can be either:
 *   - a path to a PEM file (resolved relative to where you run the CLI), or
 *   - inline PEM content (handy for params / secrets), or
 *   - a Buffer / array of the above.
 *
 * Unlike the Kerberos example, this works from BOTH Elastic's managed global
 * locations and Private Locations, because it is a launch-time Chromium flag
 * and does not touch the host trust store.
 */
export default () => {
  const config: SyntheticsConfig = {
    params: {
      // Override with the real internal URL signed by your private CA.
      url: 'https://internal.corp.local/',
    },
    // Allowlist the presented server certificate. Each entry is a PEM path or
    // inline PEM; supplying a CA certificate does not add it to Chromium's
    // trust store.
    // To inline the content instead of a path:
    //   certificateErrorSpkiAllowlist: [readFileSync('./certs/server.crt', 'utf-8')]
    certificateErrorSpkiAllowlist: ['./certs/server.crt'],

    monitor: {
      schedule: 10,
      // Works on managed global locations too — swap/add as needed.
      locations: ['us_east'],
      // privateLocations: ['my-private-location'],
    },
  };
  return config;
};
