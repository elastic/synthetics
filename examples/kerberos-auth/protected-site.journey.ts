import { journey, step, expect } from '@elastic/synthetics';

/**
 * Journey that exercises a Kerberos/NTLM-protected URL.
 *
 * At runtime Chromium receives a 401 with
 *   WWW-Authenticate: Negotiate
 * (or `NTLM`). Because the host is on `--auth-server-allowlist`, Chromium
 * asks its platform GSSAPI / SSPI layer for a token built from the
 * ambient Kerberos ticket and replays the request with
 *   Authorization: Negotiate <base64-token>
 *
 * If the handshake succeeds the page loads and the assertions below pass.
 * If it fails (no ticket, wrong SPN, host not allowlisted, delegation
 * denied) the step will fail with a 401 and a screenshot.
 */
journey('intranet (Kerberos/NTLM protected)', ({ page, params }) => {
  step('navigate to protected URL', async () => {
    const response = await page.goto(params.url, {
      waitUntil: 'domcontentloaded',
    });
    // A successful Negotiate handshake yields a non-401 response.
    expect(response?.status(), 'expected Kerberos auth to succeed').toBeLessThan(
      400
    );
  });

  step('assert authenticated content is rendered', async () => {
    // Replace with a selector that is only visible to authenticated users.
    await expect(page.locator('body')).toBeVisible();
  });
});
