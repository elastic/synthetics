# Kerberos / NTLM (Integrated Windows Authentication) example

Monitor an internal site protected by **Negotiate (SPNEGO/Kerberos)** or
**NTLM** from a **Private Location**.

There are two paths:

| Path | When to use |
| --- | --- |
| **Lightweight HTTP** (`lightweight/`) | Preferred. Native Heartbeat `kerberos` / `ntlm` blocks (same shape as the Beats reference). |
| **Browser** (Chromium flags) | Optional alternate when you need a full browser journey rather than an HTTP check. |

Both require a Private Location that can reach your realm/KDC. Managed global
locations are not supported. Kerberos and NTLM are **unavailable in FIPS**
agent builds.

## 1. Lightweight HTTP (preferred)

Uses Heartbeat’s nested auth blocks. Credentials and realm config live on the
Private Location agent host (or are supplied via the monitor YAML).

```sh
# From this example directory — push only the lightweight monitors
npx @elastic/synthetics push ./lightweight \
  --auth $KIBANA_API_KEY \
  --url $KIBANA_URL \
  --project kerberos-auth-example
```

See [`lightweight/heartbeat.yml`](./lightweight/heartbeat.yml) for Kerberos
(password or keytab) and NTLM samples. Only **one** of basic
(`username`/`password`), `kerberos.enabled`, or `ntlm.enabled` may be set per
monitor — `synthetics push` rejects combinations.

### Agent host requirements (lightweight)

1. Private Location agent can reach the KDC / domain controllers.
2. **Kerberos:** exactly one of `kerberos.config_path` (file on the agent) or
   `kerberos.krb5_conf` (inline body), plus either a password principal or a
   keytab on the agent.
3. **NTLM:** username/password (optional `domain` / `workstation`).
4. Pin monitors with `private_locations` (see the YAML sample).

## 2. Browser (optional alternate)

Elastic Synthetics drives Chromium through Playwright. Chromium already
supports Integrated Windows Authentication when you pass the usual flags via
`playwrightOptions.args`:

```ts
playwrightOptions: {
  args: [
    '--auth-server-allowlist=*.corp.local,corp.local',
    '--auth-negotiate-delegate-allowlist=*.corp.local',
  ],
}
```

The runner forwards `playwrightOptions.args` into `chromium.launch({ args })`.

### Files

| File | Purpose |
| --- | --- |
| `lightweight/heartbeat.yml` | HTTP monitors with nested `kerberos` / `ntlm`. |
| `synthetics.config.ts` | Browser: Chromium auth flags + Private Location. |
| `protected-site.journey.ts` | Browser journey against the protected URL. |

### Running the browser journey locally

```sh
npm install
npx @elastic/synthetics . --params '{"url":"https://intranet.corp.local/"}'
```

### Agent host requirements (browser)

1. Kerberos credentials available to the agent process.
   - Linux: keytab + `kinit`’d ticket cache (`KRB5CCNAME`); keep fresh via cron /
     systemd.
   - Windows: domain-joined host running as a domain user.
2. `/etc/krb5.conf` configured for your realm (Linux).
3. SPN registered (e.g. `HTTP/intranet.corp.local@CORP.LOCAL`).
4. Target hostname matches `--auth-server-allowlist` (hostname-only; `*.corp.local`
   does not match bare `corp.local`).

### Verifying Chromium flags

```sh
ps -ef | grep -E 'chrome|headless_shell' | grep -- '--auth-server-allowlist'
```

### Browser troubleshooting

| Symptom | Likely cause |
| --- | --- |
| 401, no `Authorization` header | Host not on allowlist, or no Kerberos ticket (`klist` as the agent user). |
| 401 with `Authorization: Negotiate ...` | SPN mismatch, clock skew > 5 min, or wrong principal in the cache. |
| Works interactively, fails under the agent | Agent runs as a different user — set `KRB5CCNAME` in the service unit. |
| Delegation errors | Add host to `--auth-negotiate-delegate-allowlist`; SPN trusted for delegation. |

## Limitations

- **Managed/global locations are not supported.** The host must participate in
  (or reach) your Kerberos/AD realm.
- **FIPS builds:** Heartbeat’s Kerberos/NTLM HTTP auth is not available when the
  agent is built with FIPS.
