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

import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import {
  parseHeartbeatRunRequest,
  runHeartbeatRequest,
  serveHeartbeat,
} from '../src/heartbeat';

describe('Heartbeat runner', () => {
  it('rejects malformed requests', () => {
    expect(() => parseHeartbeatRunRequest({})).toThrow(
      'invalid Heartbeat runner request: type must be "run"'
    );
  });

  it('runs sequential inline API journeys and restores monitor context', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synthetics-heartbeat-'));
    const output = join(dir, 'events.ndjson');
    const fd = openSync(output, 'w');
    const previousType = process.env.ELASTIC_SYNTHETICS_MONITOR_TYPE;

    try {
      await runHeartbeatRequest(
        {
          id: 'first',
          type: 'run',
          context: { monitorType: 'api', monitorID: 'first-monitor' },
          source: {
            type: 'inline',
            script: "step('first step', async () => {});",
          },
        },
        fd
      );
      await runHeartbeatRequest(
        {
          id: 'second',
          type: 'run',
          context: { monitorType: 'api', monitorID: 'second-monitor' },
          source: {
            type: 'inline',
            script: "step('second step', async () => {});",
          },
        },
        fd
      );
    } finally {
      closeSync(fd);
    }

    try {
      const eventTypes = readFileSync(output, 'utf-8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line).type);

      expect(eventTypes).toEqual(
        expect.arrayContaining(['journey/start', 'step/end', 'journey/end'])
      );
      expect(process.env.ELASTIC_SYNTHETICS_MONITOR_TYPE).toBe(previousType);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits events and completion over separate runner pipes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synthetics-heartbeat-'));
    const controlOutput = join(dir, 'control.ndjson');
    const eventsOutput = join(dir, 'events.ndjson');
    const controlFD = openSync(controlOutput, 'w');
    const eventsFD = openSync(eventsOutput, 'w');
    const input = new PassThrough();

    const serving = serveHeartbeat(input, controlFD, eventsFD);
    input.end(
      `${JSON.stringify({
        id: 'request-1',
        type: 'run',
        source: {
          type: 'inline',
          script: "step('single step', async () => {});",
        },
      })}\n`
    );
    await serving;
    closeSync(controlFD);
    closeSync(eventsFD);

    try {
      const controlMessages = readFileSync(controlOutput, 'utf-8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      const eventTypes = readFileSync(eventsOutput, 'utf-8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line).type);

      expect(controlMessages).toEqual([
        { type: 'ready', version: 1 },
        { id: 'request-1', type: 'completed' },
      ]);
      expect(eventTypes).toContain('heartbeat/complete');
      expect(eventTypes).toContain('journey/end');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
