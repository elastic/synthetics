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

import { CDPSession } from 'playwright-chromium';
import { FilmStrip } from '../common_types';

type TraceEvents = {
  cat: string;
  name: string;
  args?: {
    snapshot: string;
  };
  ts: number;
};

export async function readProtocolStream(
  client: CDPSession,
  handle: string
): Promise<Buffer> {
  let eof = false;
  const chunks = [];
  while (!eof) {
    const response = await client.send('IO.read', { handle });
    eof = response.eof;
    const chunk = Buffer.from(
      response.data,
      response.base64Encoded ? 'base64' : 'utf-8'
    );
    chunks.push(chunk);
  }
  await client.send('IO.close', { handle });
  return Buffer.concat(chunks);
}

export function filterFilmstrips(buffer: Buffer): Array<FilmStrip> {
  const data = JSON.parse(buffer.toString('utf-8'));
  const events = (data.traceEvents as TraceEvents[]).filter(
    ({ args, cat, name }) => {
      return (
        name === 'Screenshot' &&
        cat === 'disabled-by-default-devtools.screenshot' &&
        args &&
        args.snapshot
      );
    }
  );

  return events.map(event => ({
    snapshot: event.args.snapshot,
    name: event.name,
    ts: event.ts,
  }));
}

/**
 * Custom Tracer that only traces the filmstrips
 * https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
 */
export class Tracing {
  async start(client: CDPSession) {
    const includedCategories = ['disabled-by-default-devtools.screenshot'];
    const { categories } = await client.send('Tracing.getCategories');
    const excludedCategories = categories.filter(
      cat => !includedCategories.includes(cat)
    );

    await client.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: {
        includedCategories,
        excludedCategories,
      },
    });
  }

  async stop(client: CDPSession) {
    const [event] = await Promise.all([
      new Promise(f => client.once('Tracing.tracingComplete', f)),
      client.send('Tracing.end'),
    ]);
    return readProtocolStream(client, (event as any).stream);
  }
}
