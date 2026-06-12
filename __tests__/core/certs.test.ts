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

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getSpkiFingerprint,
  getSpkiFingerprints,
  normalizeCertificateAuthorities,
  splitPemCertificates,
} from '../../src/core/certs';

const CA_DIR = join(__dirname, '..', 'fixtures', 'ca');
const localhostCA = readFileSync(join(CA_DIR, 'localhost-ca.crt'), 'utf-8');
const selfSigned = readFileSync(join(CA_DIR, 'selfsigned.cert'), 'utf-8');

// Pre-computed via:
//   openssl x509 -in <cert> -pubkey -noout | openssl pkey -pubin -outform der \
//     | openssl dgst -sha256 -binary | openssl enc -base64
const LOCALHOST_CA_SPKI = 'i5ldWK8mZc2VpuB/HbP4QqNvC9izca4MRl+tWlgevP4=';
const SELF_SIGNED_SPKI = 'lKbtU5NxDdWZVzUHjMAVxT3j71kHJmv04kPyf3D0Khc=';

describe('certs', () => {
  describe('normalizeCertificateAuthorities', () => {
    it('returns an empty list when nothing is provided', () => {
      expect(normalizeCertificateAuthorities(undefined)).toEqual([]);
      expect(normalizeCertificateAuthorities('')).toEqual([]);
      expect(normalizeCertificateAuthorities('   ')).toEqual([]);
    });

    it('wraps a single string entry', () => {
      expect(normalizeCertificateAuthorities(localhostCA)).toEqual([
        localhostCA,
      ]);
    });

    it('converts Buffers to strings', () => {
      expect(normalizeCertificateAuthorities(Buffer.from(localhostCA))).toEqual(
        [localhostCA]
      );
    });

    it('flattens arrays of strings and Buffers', () => {
      const result = normalizeCertificateAuthorities([
        localhostCA,
        Buffer.from(selfSigned),
      ]);
      expect(result).toEqual([localhostCA, selfSigned]);
    });
  });

  describe('splitPemCertificates', () => {
    it('splits a bundle into individual certificates', () => {
      const bundle = `${localhostCA}\n${selfSigned}`;
      expect(splitPemCertificates(bundle)).toHaveLength(2);
    });

    it('returns an empty list when there are no PEM markers', () => {
      expect(splitPemCertificates('not a certificate')).toEqual([]);
    });
  });

  describe('getSpkiFingerprint', () => {
    it('computes the base64 SHA-256 SPKI fingerprint', () => {
      expect(getSpkiFingerprint(localhostCA)).toBe(LOCALHOST_CA_SPKI);
      expect(getSpkiFingerprint(selfSigned)).toBe(SELF_SIGNED_SPKI);
    });
  });

  describe('getSpkiFingerprints', () => {
    it('returns an empty list when no CA is provided', () => {
      expect(getSpkiFingerprints(undefined)).toEqual([]);
    });

    it('computes fingerprints for every certificate in the input', () => {
      expect(getSpkiFingerprints([localhostCA, selfSigned])).toEqual([
        LOCALHOST_CA_SPKI,
        SELF_SIGNED_SPKI,
      ]);
    });

    it('handles a bundle that contains multiple certificates', () => {
      const bundle = `${localhostCA}\n${selfSigned}`;
      expect(getSpkiFingerprints(bundle)).toEqual([
        LOCALHOST_CA_SPKI,
        SELF_SIGNED_SPKI,
      ]);
    });

    it('de-duplicates repeated certificates', () => {
      expect(getSpkiFingerprints([localhostCA, localhostCA])).toEqual([
        LOCALHOST_CA_SPKI,
      ]);
    });

    it('skips invalid entries instead of throwing', () => {
      expect(
        getSpkiFingerprints(
          '-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----'
        )
      ).toEqual([]);
    });
  });
});
