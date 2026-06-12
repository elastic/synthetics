import { journey, step, expect } from '@elastic/synthetics';

/**
 * Journey that loads an internal HTTPS site served with a certificate issued
 * by a private / internal CA.
 *
 * With `certificateAuthorities` configured (see synthetics.config.ts), the
 * Synthetics runner pins the CA's SPKI fingerprint via
 * `--ignore-certificate-errors-spki-list`, so Chromium trusts the certificate
 * and `page.goto` resolves instead of failing with
 * `net::ERR_CERT_AUTHORITY_INVALID`.
 *
 * Remove the `certificateAuthorities` setting (or point it at the wrong CA) and
 * this journey fails — proof that validation is still happening, just scoped to
 * the keys you trust.
 */
journey('internal site (private CA)', ({ page, params }) => {
  step('navigate to the internal HTTPS URL', async () => {
    const response = await page.goto(params.url, {
      waitUntil: 'domcontentloaded',
    });
    expect(
      response?.status(),
      'expected the internal CA to be trusted'
    ).toBeLessThan(400);
  });

  step('assert page content rendered', async () => {
    // Replace with a selector that is unique to your internal app.
    await expect(page.locator('body')).toBeVisible();
  });
});
