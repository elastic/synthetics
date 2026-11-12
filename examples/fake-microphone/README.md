# Fake microphone example

Browser monitors on Elastic-hosted locations have no real microphone.
Chromium's `--use-file-for-fake-audio-capture` flag also does not work
after `push`: sidecar `.wav` files are not bundled, and the flag needs a
launch-time filesystem path the managed host does not have.

This example feeds a synthetic `MediaStream` through `getUserMedia`
before the page loads. That works on public locations, without a
Private Location, and without host files.

Playwright 1.49+ launches **chrome-headless-shell** by default (Elastic
Synthetics uses that). Headless shell rejects real `getUserMedia` with
`NotSupportedError`, so `--use-fake-device-for-media-stream` is not
enough on the default runner. The in-page mock does not depend on it.

## Files

| File | Purpose |
|---|---|
| `synthetics.config.ts` | Mic permission + optional Chromium fake-device flags |
| `microphone.journey.ts` | Journey that installs the mock, then asserts audio energy |
| `helpers.ts` | Demo page (via `page.route`), mock, assertions |

The demo page is fulfilled in-process so the example is self-contained.
Point `page.goto` at your own LiveKit / WebRTC app when adapting this.

Install the mock **before** `page.goto` so the page's SDK never sees an
empty `getUserMedia`. Resume `AudioContext` inside the mock — a
suspended context is the usual reason a mock "kinda works".

## Running

```sh
npm install
npx @elastic/synthetics .
```

From the synthetics repo root, after `npm run build`:

```sh
node dist/cli.js examples/fake-microphone
```

## Adapting for a real voice app

1. Keep `installMockMicrophone(page)` before navigation.
2. Replace `openMicDemo()` with `page.goto` to your app.
3. Drive the UI until the client publishes/listens, then assert
   whatever yes/no signal you have (connection state, "audio
   detected", etc.).

Need a **specific** wav rather than a tone? Inline it as base64 in the
journey, write it to `/tmp/fake.wav` in `beforeAll` (that hook runs
before Chromium launches), and add
`--use-file-for-fake-audio-capture=/tmp/fake.wav` to
`playwrightOptions.args`. Do not `import './file.wav'` — `push` will
not ship it. This still requires full Chromium, not headless shell.

## Limitations

- The mock proves the **capture pipeline**, not playback quality or a
  physical mic.
- `--use-file-for-fake-audio-capture` with a repo-relative path only
  works locally, where the file exists on disk.
- Lightweight HTTP monitors cannot exercise WebRTC.
