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

import { parentPort } from 'worker_threads';
import { HeartbeatRunRequest, runHeartbeatRequest } from './heartbeat';
import JSONReporter from './reporters/json';

const port = parentPort;
if (!port) {
  throw new Error('Heartbeat worker must run in a worker thread');
}

type HeartbeatWorkerResponse =
  | { type: 'ready' }
  | { id: string; type: 'event'; event: unknown }
  | { id: string; type: 'completed' }
  | { id: string; type: 'error'; error: { message: string } };

function respond(message: HeartbeatWorkerResponse) {
  port.postMessage(message);
}

port.on('message', async (request: HeartbeatRunRequest) => {
  try {
    class HeartbeatReporter extends JSONReporter {
      override write(event: unknown) {
        respond({ id: request.id, type: 'event', event });
      }
    }
    await runHeartbeatRequest(request, 1, HeartbeatReporter);
    respond({ id: request.id, type: 'completed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respond({ id: request.id, type: 'error', error: { message } });
  }
});

respond({ type: 'ready' });
