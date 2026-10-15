import type { SyntheticsConfig } from '@elastic/synthetics';

/**
 * Microphone permission is a Playwright *context* option; the runner
 * spreads `playwrightOptions` into both `chromium.launch()` and
 * `browser.newContext()`.
 *
 * `--use-fake-ui-for-media-stream` / `--use-fake-device-for-media-stream`
 * only help on full Chromium. Playwright 1.49+ launches
 * chrome-headless-shell by default, which rejects getUserMedia with
 * `NotSupportedError`. Elastic Synthetics uses that default, so the
 * journey relies on the in-page mock instead of these flags.
 *
 * `--use-file-for-fake-audio-capture=/path/file.wav` also does not
 * survive `push`: sidecar files are not bundled, and the flag needs a
 * launch-time filesystem path the managed host does not have.
 */
export default () => {
  const config: SyntheticsConfig = {
    playwrightOptions: {
      permissions: ['microphone'],
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  };
  return config;
};
