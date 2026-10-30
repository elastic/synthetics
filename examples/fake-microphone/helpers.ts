import { expect, type Page } from '@elastic/synthetics';

/**
 * Served through `page.route` so the demo is a secure context (required by
 * getUserMedia) without a local static server. Swap this URL for a real
 * LiveKit / WebRTC app when adapting the journey.
 */
export const MIC_DEMO_URL =
  'https://example.com/elastic-synthetics-mic-demo';

const MIC_DEMO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Synthetics microphone demo</title>
  </head>
  <body>
    <button id="start">Start microphone</button>
    <p data-testid="mic-status">idle</p>
    <p data-testid="mic-level">0</p>
    <script>
      const status = document.querySelector('[data-testid="mic-status"]');
      const level = document.querySelector('[data-testid="mic-level"]');

      async function start() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          status.textContent = 'live';
          const ctx = new AudioContext();
          await ctx.resume();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          function tick() {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            level.textContent = Math.sqrt(sum / data.length).toFixed(4);
            requestAnimationFrame(tick);
          }
          tick();
        } catch (err) {
          status.textContent = 'error';
          status.setAttribute(
            'data-error',
            (err && err.name ? err.name : 'Error') + ': ' + (err && err.message)
          );
        }
      }
      document.getElementById('start').onclick = start;
    </script>
  </body>
</html>`;

export async function openMicDemo(page: Page) {
  await page.route('**/elastic-synthetics-mic-demo**', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: MIC_DEMO_HTML,
    })
  );
  await page.goto(MIC_DEMO_URL, { waitUntil: 'domcontentloaded' });
}

/**
 * Replace getUserMedia with a Web Audio oscillator *before* the page's JS
 * runs. This is the Checkly-style path that works on Elastic-hosted
 * locations: no wav on disk, no Chromium file-capture flag.
 *
 * For LiveKit, keep this as `addInitScript` before `page.goto` so the SDK
 * never sees the real (empty) device list. Resume AudioContext — a
 * suspended context is the usual reason a mock "kinda works".
 */
export async function installMockMicrophone(page: Page) {
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    if (!devices) {
      return;
    }

    const originalGetUserMedia = devices.getUserMedia.bind(devices);

    devices.enumerateDevices = async () => [
      {
        deviceId: 'synthetics-fake-mic',
        groupId: 'synthetics-fake-group',
        kind: 'audioinput',
        label: 'Synthetics Fake Microphone',
        toJSON() {
          return this;
        },
      },
    ];

    devices.getUserMedia = async constraints => {
      if (!constraints || !constraints.audio) {
        return originalGetUserMedia(constraints);
      }

      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.35;
      oscillator.connect(gain).connect(destination);
      oscillator.start();

      const track = destination.stream.getAudioTracks()[0];
      const originalStop = track.stop.bind(track);
      track.stop = () => {
        oscillator.stop();
        context.close();
        originalStop();
      };

      return destination.stream;
    };
  });
}

export async function startMicAndAssertLive(page: Page) {
  await page.locator('#start').click();
  const status = page.locator('[data-testid="mic-status"]');
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="mic-status"]')
        ?.textContent;
      return text === 'live' || text === 'error';
    },
    null,
    { timeout: 15_000 }
  );
  await expect(
    status,
    (await status.getAttribute('data-error')) ?? 'microphone should start'
  ).toHaveText('live');
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-testid="mic-level"]')?.textContent
      ) > 0.01,
    null,
    { timeout: 15_000 }
  );
}
