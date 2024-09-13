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

import { TOTP } from "otpauth";

type TOTPOptions = {
  /**
   * Service provider name.
   */
  issuer?: string
  /**
   * Account Identifier.
   */
  label?: string
  /**
  * Include issuer prefix in label.
  */
  issuerInLabel?: boolean
  /**
   * The encoded secret key used to generate the TOTP.
   */
  secret?: string
  /**
   * The algorithm used to generate the TOTP.
   * @default 'SHA1'
   */
  algorithm?: string
  /**
   * Length of the generated token.
   * @default 6
   */
  digits?: number
  /**
   * Interval in seconds for which the token is valid.
   * @default 30
   */
  period?: number
};

export function createTOTP(options: TOTPOptions) {
  return new TOTP({ ...options });
}
