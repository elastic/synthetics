# Internal / private CA example

This example shows how to run an Elastic Synthetics **browser monitor** against
an internal HTTPS site whose certificate is signed by a **private / internal
Certificate Authority (CA)** — without rebuilding the agent image and without
disabling TLS validation.

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

## The fix: `certificateAuthorities`

Configure the CA(s) you trust and the Synthetics runner computes each CA's
SHA-256 **SPKI fingerprint** and passes them to Chromium via
`--ignore-certificate-errors-spki-list`. Chromium then trusts certificates
chaining to those public keys and nothing else:

```ts
// synthetics.config.ts
import type { SyntheticsConfig } from '@elastic/synthetics';

export default (): SyntheticsConfig => ({
  // Path to a PEM file, inline PEM, a Buffer, or an array of any of these.
  certificateAuthorities: ['./certs/internal-ca.crt'],
});
```

Or per-run from the CLI (variadic — pass more than one):

```sh
npx @elastic/synthetics . --certificate-authorities ./certs/internal-ca.crt
```

Unlike the Kerberos example, this works from **both** Elastic's managed global
locations and Private Locations, because it is a launch-time Chromium flag and
does not touch the host trust store.

## Files

| File | Purpose |
|---|---|
| `synthetics.config.ts` | Declares the trusted internal CA. |
| `internal-site.journey.ts` | Navigates to the internal HTTPS URL and asserts a successful response. |

## Running

```sh
npm install
npx @elastic/synthetics . \
  --certificate-authorities ./certs/internal-ca.crt \
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

3. **Run the journey against it.** First WITHOUT the CA to see it fail:

```sh
npx @elastic/synthetics . --params '{"url":"https://localhost:8443/"}'
# -> step fails with net::ERR_CERT_AUTHORITY_INVALID
```

   Now WITH the CA — it passes:

```sh
npx @elastic/synthetics . \
  --certificate-authorities ./certs/internal-ca.crt \
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

- **Targeted, not blanket.** Only certificates chaining to the SPKI hashes you
  provide are trusted; every other endpoint is validated normally. This is much
  safer than `ignoreHTTPSErrors: true`.
- **SPKI pinning bypasses *all* cert errors for the pinned keys** — including
  expiry and hostname mismatch — because it matches on the public key. Trust
  only CAs you control.
- **Rotate carefully.** If the CA's key pair changes, update
  `certificateAuthorities` with the new CA so the new SPKI hash is pinned.
- **Lightweight (HTTP/TCP/ICMP) monitors** are unaffected by this setting; it
  applies to browser monitors. The CLI side (e.g. `push` talking to a
  Kibana fronted by an internal CA) is covered separately.
