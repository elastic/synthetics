# Internal HTTPS certificate-error bypass example

This example shows how to run an Elastic Synthetics **browser monitor** against
an internal HTTPS site whose certificate is signed by a **private / internal
Certificate Authority (CA)** — without rebuilding the agent image or disabling
certificate checks for every endpoint.

## The problem

Chromium on Linux validates certificates against its own **NSS trust store**,
not the operating system store. So even if your internal root CA is installed on
the host (`/etc/ssl/certs`, `update-ca-certificates`, …), Chromium still fails
with:

```
net::ERR_CERT_AUTHORITY_INVALID
```

Historically the only options were to bake the CA into a custom agent image, or
set `ignoreHTTPSErrors: true` — which turns off validation for **every** request.

## The workaround: `certificateErrorSpkiAllowlist`

This option does **not** add a CA to Chromium's trust store. Configure the PEM
certificate presented by the internal server. The Synthetics runner computes
its SHA-256 **SPKI fingerprint** and passes it to Chromium via
`--ignore-certificate-errors-spki-list`. Chromium then ignores certificate
errors only for a presented certificate with that public key:

```ts
// synthetics.config.ts
import type { SyntheticsConfig } from '@elastic/synthetics';

export default (): SyntheticsConfig => ({
  // Path to a PEM file, inline PEM, a Buffer, or an array of any of these.
  certificateErrorSpkiAllowlist: ['./certs/server.crt'],
});
```

Or per-run from the CLI (variadic — pass more than one):

```sh
npx @elastic/synthetics . --certificate-error-spki-allowlist ./certs/server.crt
```

Unlike the Kerberos example, this works from **both** Elastic's managed global
locations and Private Locations, because it is a launch-time Chromium flag and
does not touch the host trust store.

## Files

| File | Purpose |
|---|---|
| `synthetics.config.ts` | Allowlists the internal server certificate's SPKI. |
| `internal-site.journey.ts` | Navigates to the internal HTTPS URL and asserts a successful response. |

## Running

```sh
npm install
npx @elastic/synthetics . \
  --certificate-error-spki-allowlist ./certs/server.crt \
  --params '{"url":"https://internal.corp.local/"}'
```

## Testing it locally end-to-end

You can prove the behaviour with a throwaway CA and a tiny HTTPS server — no
internal infrastructure required.

1. **Generate a private CA and a server cert signed by it:**

```sh
mkdir -p certs && cd certs

# Root CA
openssl req -x509 -newkey rsa:2048 -nodes -keyout internal-ca.key \
  -out internal-ca.crt -days 3650 -subj "/CN=Example Internal CA"

# Server key + CSR for localhost
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj "/CN=localhost"

# Sign the server cert with the CA (incl. SAN so Chromium is happy)
openssl x509 -req -in server.csr -CA internal-ca.crt -CAkey internal-ca.key \
  -CAcreateserial -out server.crt -days 825 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")
cd ..
```

2. **Serve a page over HTTPS with the signed cert** (in a separate terminal):

```sh
node -e "require('https').createServer({key:require('fs').readFileSync('certs/server.key'),cert:require('fs').readFileSync('certs/server.crt')},(_,res)=>res.end('<h1>internal ok</h1>')).listen(8443,()=>console.log('https://localhost:8443'))"
```

3. **Run the journey against it.** First WITHOUT the SPKI allowlist to see it fail:

```sh
npx @elastic/synthetics . --params '{"url":"https://localhost:8443/"}'
# -> step fails with net::ERR_CERT_AUTHORITY_INVALID
```

   Now WITH the server certificate's SPKI allowlisted — it passes:

```sh
npx @elastic/synthetics . \
  --certificate-error-spki-allowlist ./certs/server.crt \
  --params '{"url":"https://localhost:8443/"}'
# -> journey succeeds
```

### Confirming the flag reached Chromium

Run a journey in non-headless mode and inspect the browser process:

```sh
ps -ef | grep -E 'chrome|headless_shell' | grep -- '--ignore-certificate-errors-spki-list'
```

You should see `--ignore-certificate-errors-spki-list=<base64-hash>` on the main
browser process command line.

## Security notes & limitations

- **Targeted, not blanket.** Chromium ignores certificate errors only when a
  presented certificate's SPKI matches the allowlist. Other endpoints still
  undergo normal validation, making this narrower than `ignoreHTTPSErrors: true`.
- **This is not CA trust.** The option does not install a CA or validate a chain
  against it. A matching certificate bypasses *all* certificate errors,
  including expiry and hostname mismatch.
- **Rotate carefully.** When the server certificate's key pair changes, update
  `certificateErrorSpkiAllowlist` with the new presented certificate so its SPKI hash
  is allowlisted.
- **Lightweight (HTTP/TCP/ICMP) monitors and CLI connections** are unaffected
  by this setting; it only affects the Chromium process used by browser
  monitors.
