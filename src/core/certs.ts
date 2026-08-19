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
import { readFileSync } from 'fs';
import { rootCertificates } from 'tls';
import {
  CertificateAuthorities,
  CertificateErrorSpkiAllowlist,
} from '../common_types';
import { warn } from '../helpers';

const PEM_CERTIFICATE_RE =
  /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/**
 * Flatten user-provided PEM certificates (string, Buffer, or an array of
 * either) into a list of PEM strings. Each entry may itself be a bundle that
 * contains more than one certificate.
 */
export function normalizePemCertificates(
  certificates?: CertificateErrorSpkiAllowlist | CertificateAuthorities
): string[] {
  if (certificates == null) {
    return [];
  }
  const entries = Array.isArray(certificates) ? certificates : [certificates];
  return entries
    .map(entry => (Buffer.isBuffer(entry) ? entry.toString('utf-8') : entry))
    .filter((entry): entry is string => Boolean(entry && entry.trim()));
}

export function normalizeCertificateErrorSpkiAllowlist(
  certificates?: CertificateErrorSpkiAllowlist
): string[] {
  return normalizePemCertificates(certificates);
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
 * Describe an entry that failed to parse as a certificate for use in a
 * warning message. A raw file path (e.g. from a typo'd
 * `certificateErrorSpkiAllowlist` entry that didn't match an existing file) is
 * shown as-is since that's the actionable detail; inline PEM content is not,
 * to avoid dumping key material to the console.
 */
function describeInvalidCertificateEntry(candidate: string): string {
  if (candidate.includes('-----BEGIN CERTIFICATE-----')) {
    return 'an inline PEM certificate';
  }
  const preview =
    candidate.length > 80 ? `${candidate.slice(0, 80)}...` : candidate;
  return `"${preview}"`;
}

/**
 * Build the list of SPKI fingerprints for all supplied certificates. Chromium
 * uses this list to bypass certificate errors for matching presented
 * certificates; it does not establish CA trust. Invalid certificates are
 * skipped, with a warning, so a single bad entry never aborts the whole run
 * but also never fails silently - a `certificateErrorSpkiAllowlist` entry that
 * doesn't resolve to a real file and isn't valid PEM (e.g. a typo'd path)
 * would otherwise never be allowlisted, and matching endpoints would keep
 * failing certificate validation with no indication why.
 */
export function getSpkiFingerprints(
  certificates?: CertificateErrorSpkiAllowlist
): string[] {
  const fingerprints = new Set<string>();
  for (const entry of normalizeCertificateErrorSpkiAllowlist(certificates)) {
    const pemCertificates = splitPemCertificates(entry);
    // Fall back to treating the whole entry as a single certificate when no
    // PEM boundary markers are present.
    const candidates = pemCertificates.length > 0 ? pemCertificates : [entry];
    for (const certificate of candidates) {
      try {
        fingerprints.add(getSpkiFingerprint(certificate));
      } catch (e) {
        warn(
          `certificateErrorSpkiAllowlist: could not parse ${describeInvalidCertificateEntry(
            certificate
          )} as a certificate - it will not be allowlisted and matching endpoints may still fail certificate validation (${
            e.message
          })`
        );
      }
    }
  }
  return [...fingerprints];
}

/**
 * NODE_EXTRA_CA_CERTS is only applied when Node uses its default trust store.
 * Passing an explicit `ca` to undici replaces that store, so we have to fold
 * the extra file in ourselves whenever we build a bundle.
 */
function readNodeExtraCaCerts(): string[] {
  const extraPath = process.env.NODE_EXTRA_CA_CERTS;
  if (!extraPath) {
    return [];
  }
  try {
    return [readFileSync(extraPath, 'utf-8')];
  } catch {
    return [];
  }
}

/**
 * Produce a CA bundle suitable for Node/undici TLS clients. User-supplied
 * authorities are appended to Node's built-in roots (and NODE_EXTRA_CA_CERTS)
 * so trusting an internal CA never silently drops trust for publicly signed
 * endpoints.
 */
export function buildCABundle(
  ca?: CertificateAuthorities
): string[] | undefined {
  const extra = normalizePemCertificates(ca);
  if (extra.length === 0) {
    return undefined;
  }
  return [...rootCertificates, ...readNodeExtraCaCerts(), ...extra];
}
