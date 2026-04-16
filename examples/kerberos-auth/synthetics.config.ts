import type { SyntheticsConfig } from '@elastic/synthetics';

/**
 * Example configuration that enables Chromium's built-in Negotiate (SPNEGO/
 * Kerberos) and NTLM authentication for browser monitors.
 *
 * Chromium natively supports Integrated Windows Authentication; it just needs
 * to be told which servers are allowed to initiate the handshake. Those
 * switches are ordinary Chromium command-line flags, so we forward them via
 * `playwrightOptions.args`, which the Synthetics runner spreads directly into
 * `chromium.launch({ args })`.
 *
 * Prerequisites on the host running the Private Location agent:
 *
 *   1. The agent host must be able to obtain a Kerberos ticket for the
 *      service principal(s) you want to monitor. On Linux this typically
 *      means a keytab plus a kinit'd credential cache that is kept fresh
 *      (cron / systemd timer). On a domain-joined Windows host the OS handles
 *      this automatically.
 *
 *   2. The user that runs the Private Location agent must have KRB5CCNAME
 *      (or the default file ccache) populated with a valid TGT at the time
 *      journeys execute.
 *
 *   3. `--auth-server-allowlist` matches on hostname only (not full URLs) and
 *      supports shell-style wildcards. `*.corp.local` matches `a.corp.local`
 *      but NOT the bare `corp.local` — list both or use `*corp.local` when
 *      needed.
 *
 * This example will NOT work from Elastic's managed global locations; it
 * requires a Private Location on a host that is part of, or can
 * authenticate against, your Kerberos/AD realm.
 */
export default () => {
  const config: SyntheticsConfig = {
    params: {
      // Override with the real internal URL of the protected resource.
      url: 'https://intranet.corp.local/',
    },
    playwrightOptions: {
      ignoreHTTPSErrors: false,
      args: [
        // Hosts allowed to perform Integrated Auth. Comma-separated, supports
        // shell-style wildcards. Tighten this to only the domains you trust.
        '--auth-server-allowlist=*.corp.local,corp.local',

        // Hosts allowed to receive a forwardable (delegated) Kerberos ticket.
        // Only include services that genuinely need delegation.
        '--auth-negotiate-delegate-allowlist=*.corp.local',

        // Optional: disable the canonical-name DNS lookup that Chromium
        // performs to build the SPN. Turn this off if your SPNs are
        // registered under the short hostname rather than the FQDN returned
        // by reverse DNS.
        // '--disable-auth-negotiate-cname-lookup',
      ],
    },
    monitor: {
      schedule: 10,
      // Integrated auth only works from Private Locations.
      privateLocations: ['my-private-location'],
    },
  };
  return config;
};
