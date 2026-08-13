import { journey, step, expect } from '@elastic/synthetics';

/**
 * Journey that loads an internal HTTPS site served with a certificate issued
 * by a private / internal CA.
 *
 * With `certificateErrorSpkiAllowlist` configured (see synthetics.config.ts), the
 * Synthetics runner allowlists the server certificate's SPKI fingerprint via
 * `--ignore-certificate-errors-spki-list`, so Chromium bypasses its
 * certificate errors and `page.goto` resolves instead of failing with
 * `net::ERR_CERT_AUTHORITY_INVALID`.
 *
 * Remove the `certificateErrorSpkiAllowlist` setting (or point it at the wrong
 * certificate) and this journey fails. This is a targeted error bypass, not
 * CA trust.
 */
journey('internal site (private CA)', ({ page, params }) => {
  step('navigate to the internal HTTPS URL', async () => {
    const response = await page.goto(params.url, {
      waitUntil: 'domcontentloaded',
    });
    expect(
      response?.status(),
      'expected the allowlisted certificate error to be bypassed'
    ).toBeLessThan(400);
  });

  step('assert page content rendered', async () => {
    // Replace with a selector that is unique to your internal app.
    await expect(page.locator('body')).toBeVisible();
  });
});
