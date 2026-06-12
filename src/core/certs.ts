/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { X509Certificate, createHash } from 'crypto';
import { rootCertificates } from 'tls';
import { CertificateAuthorities } from '../common_types';

const PEM_CERTIFICATE_RE =
  /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/**
 * Normalize the user provided certificate authorities (string, Buffer or an
 * array of either) into a flat list of PEM strings. Each entry may itself be a
 * bundle that contains more than one certificate.
 */
export function normalizeCertificateAuthorities(
  ca?: CertificateAuthorities
): string[] {
  if (ca == null) {
    return [];
  }
  const entries = Array.isArray(ca) ? ca : [ca];
  return entries
    .map(entry => (Buffer.isBuffer(entry) ? entry.toString('utf-8') : entry))
    .filter((entry): entry is string => Boolean(entry && entry.trim()));
}

/**
 * Split a PEM bundle into the individual certificates it contains. Node's
 * `X509Certificate` only parses the first certificate of a bundle, so we have
 * to slice them apart ourselves to support full chains / multiple CAs.
 */
export function splitPemCertificates(pem: string): string[] {
  return pem.match(PEM_CERTIFICATE_RE) ?? [];
}

/**
 * Compute the base64 encoded SHA-256 fingerprint of a certificate's
 * SubjectPublicKeyInfo (SPKI). This is the exact value Chromium expects in the
 * `--ignore-certificate-errors-spki-list` switch.
 */
export function getSpkiFingerprint(pem: string): string {
  const der = new X509Certificate(pem).publicKey.export({
    type: 'spki',
    format: 'der',
  });
  return createHash('sha256').update(der).digest('base64');
}

/**
 * Build the list of SPKI fingerprints for all certificates contained in the
 * provided certificate authorities. Invalid certificates are skipped with a
 * warning so a single bad entry never aborts the whole run.
 */
export function getSpkiFingerprints(ca?: CertificateAuthorities): string[] {
  const fingerprints = new Set<string>();
  for (const entry of normalizeCertificateAuthorities(ca)) {
    const certificates = splitPemCertificates(entry);
    // Fall back to treating the whole entry as a single certificate when no
    // PEM boundary markers are present.
    const candidates = certificates.length > 0 ? certificates : [entry];
    for (const certificate of candidates) {
      try {
        fingerprints.add(getSpkiFingerprint(certificate));
      } catch {
        // Skip invalid entries so a single bad certificate never aborts a run.
      }
    }
  }
  return [...fingerprints];
}

/**
 * Produce a CA bundle suitable for Node/undici TLS clients. The user supplied
 * authorities are appended to Node's built-in root certificates so trusting an
 * internal CA never silently drops trust for publicly signed endpoints.
 */
export function buildCABundle(
  ca?: CertificateAuthorities
): string[] | undefined {
  const extra = normalizeCertificateAuthorities(ca);
  if (extra.length === 0) {
    return undefined;
  }
  return [...rootCertificates, ...extra];
}
