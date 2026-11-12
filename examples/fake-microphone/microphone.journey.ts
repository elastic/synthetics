import { journey, step } from '@elastic/synthetics';
import {
  installMockMicrophone,
  openMicDemo,
  startMicAndAssertLive,
} from './helpers';

/**
 * In-page getUserMedia mock. Copy this pattern for a real voice app
 * (LiveKit, WebRTC, etc.): call `installMockMicrophone(page)` before
 * `goto` so the SDK never sees an empty device list.
 *
 * Chromium fake-device flags are not enough on the default Synthetics
 * runner (Playwright chrome-headless-shell returns NotSupportedError
 * for getUserMedia). The mock does not depend on that.
 */
journey('mocked getUserMedia', ({ page }) => {
  step('install mock and open microphone demo', async () => {
    await installMockMicrophone(page);
    await openMicDemo(page);
  });

  step('capture from mocked stream and see audio energy', async () => {
    await startMicAndAssertLive(page);
  });
});
