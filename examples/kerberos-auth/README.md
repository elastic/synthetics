# Kerberos / NTLM (Integrated Windows Authentication) example

This example shows how to monitor an internal site that is protected by
**Negotiate (SPNEGO/Kerberos)** or **NTLM** using an Elastic Synthetics
browser monitor.

Elastic Synthetics drives Chromium through Playwright, and Chromium
already has first-class support for Integrated Windows Authentication.
All we need to do is pass it the usual command-line flags through
`playwrightOptions.args`:

```ts
playwrightOptions: {
  args: [
    '--auth-server-allowlist=*.corp.local,corp.local',
    '--auth-negotiate-delegate-allowlist=*.corp.local',
  ],
}
```

The Synthetics runner forwards `playwrightOptions.args` verbatim into
`chromium.launch({ args })`, so the flags land on the real Chromium
process.

## Requirements

This workaround works with **Private Locations only**. It will not work
from Elastic's managed global locations.

On the host running the Private Location agent:

1. **Kerberos credentials must be available to the agent process.**
   - Linux: a keytab for the service account plus a `kinit`'d ticket
     cache (`KRB5CCNAME`). Keep it fresh with a cron job or
     `systemd` timer (e.g. `kinit -R` every few hours, `kinit -kt` on
     failure).
   - Windows: run the agent on a domain-joined host as a domain user;
     the OS will supply tickets automatically.
2. **`/etc/krb5.conf`** (Linux) must be configured for your realm.
3. **The SPN** (e.g. `HTTP/intranet.corp.local@CORP.LOCAL`) must be
   registered against the service account that fronts the protected URL.
4. **The target hostname** must match an entry in
   `--auth-server-allowlist`. The matcher is hostname-only and supports
   shell-style wildcards — `*.corp.local` will NOT match the bare
   `corp.local`.

## Files

| File | Purpose |
|---|---|
| `synthetics.config.ts` | Enables the Chromium auth flags and pins the monitor to a Private Location. |
| `protected-site.journey.ts` | Example journey that navigates to the protected URL and asserts a successful authenticated response. |

## Running

```sh
npm install
npx @elastic/synthetics . --params '{"url":"https://intranet.corp.local/"}'
```

### Verifying the flags are applied

If you want to confirm Chromium actually received the flags, run any
journey in non-headless mode and inspect the process from another shell:

```sh
ps -ef | grep -E 'chrome|headless_shell' | grep -- '--auth-server-allowlist'
```

You should see both `--auth-server-allowlist=...` and
`--auth-negotiate-delegate-allowlist=...` in the command line of the main
browser process.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| 401 on every request, no `Authorization` header sent | Host does not match the allowlist pattern, or the agent process has no Kerberos ticket. Check with `klist` as the agent user. |
| 401 with `Authorization: Negotiate ...` sent but still rejected | SPN mismatch, clock skew > 5 min, or the ticket cache is for the wrong principal. |
| Works interactively but fails under the agent | The agent service is running as a different user than your shell. Set `KRB5CCNAME` in the service unit or mount a shared ccache. |
| Delegation errors on downstream hops | Add the downstream host to `--auth-negotiate-delegate-allowlist` and make sure its SPN is marked *Trusted for Delegation* in AD. |

## Limitations

- **Lightweight HTTP monitors are not supported.** Heartbeat's Go HTTP
  client has no native Negotiate/NTLM transport, so this approach cannot
  be extended to `http` monitors today. Use a browser monitor for
  Kerberos-protected endpoints until native support lands.
- **Managed/global locations are not supported.** The flags are only
  useful if the host executing Chromium has access to the realm.
