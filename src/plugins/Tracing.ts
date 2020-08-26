import { CDPSession } from 'playwright';
import { FilmStrips } from '../common_types';

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

export function filterFilmstrips(buffer: Buffer): FilmStrips {
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
    ts: event.ts
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
        excludedCategories
      }
    });
  }

  async stop(client: CDPSession) {
    const [event] = await Promise.all([
      new Promise(f => client.once('Tracing.tracingComplete', f)),
      client.send('Tracing.end')
    ]);
    return readProtocolStream(client, (event as any).stream);
  }
}
