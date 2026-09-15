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
 */

import { writeSync } from 'fs';
import { resolve, sep } from 'path';
import { createInterface } from 'readline';
import { stdin } from 'process';
import { CliArgs, RunOptions } from './common_types';
import { runner } from './core/globals';
import { globalSetup } from './loader';

const eventFD = 3;
const controlFD = Number(process.env.ELASTIC_SYNTHETICS_CONTROL_FD ?? 4);
const protocolVersion = 1;

type HeartbeatRunSource =
  | { type: 'inline'; script: string }
  | { type: 'project'; path: string };

type HeartbeatRunContext = {
  traceID?: string;
  monitorID?: string;
  monitorType?: string;
  locationID?: string;
};

type HeartbeatRunOptions = {
  params?: Record<string, unknown>;
  tags?: string[];
  match?: string;
  playwrightOptions?: Record<string, unknown>;
  ignoreHTTPSErrors?: boolean;
};

export type HeartbeatRunRequest = {
  id: string;
  type: 'run';
  source: HeartbeatRunSource;
  context?: HeartbeatRunContext;
  options?: HeartbeatRunOptions;
};

type HeartbeatControlMessage =
  | { type: 'ready'; version: number }
  | { id: string; type: 'completed' }
  | { id: string; type: 'error'; error: { message: string } };

const crosslinkEnv = {
  traceID: 'ELASTIC_SYNTHETICS_TRACE_ID',
  monitorID: 'ELASTIC_SYNTHETICS_MONITOR_ID',
  monitorType: 'ELASTIC_SYNTHETICS_MONITOR_TYPE',
  locationID: 'ELASTIC_SYNTHETICS_MONITOR_LOCATION',
} as const;

function writeControl(message: HeartbeatControlMessage, fd = controlFD) {
  writeSync(fd, `${JSON.stringify(message)}\n`);
}

function writeCompletion(id: string, fd = eventFD) {
  // Events and control messages travel over independent pipes. Emit the
  // completion marker after JSONReporter has synchronously flushed all journey
  // events so Heartbeat can close the corresponding event stream safely.
  writeSync(fd, `${JSON.stringify({ type: 'heartbeat/complete', id })}\n`);
}

function requestError(message: string): Error {
  return new Error(`invalid Heartbeat runner request: ${message}`);
}

export function parseHeartbeatRunRequest(value: unknown): HeartbeatRunRequest {
  if (!value || typeof value !== 'object') {
    throw requestError('request must be an object');
  }

  const request = value as Partial<HeartbeatRunRequest>;
  if (request.type !== 'run') {
    throw requestError('type must be "run"');
  }
  if (!request.id || typeof request.id !== 'string') {
    throw requestError('id must be a non-empty string');
  }
  if (!request.source || typeof request.source !== 'object') {
    throw requestError('source must be an object');
  }

  const source = request.source as HeartbeatRunSource;
  if (source.type === 'inline' && typeof source.script === 'string') {
    return request as HeartbeatRunRequest;
  }
  if (source.type === 'project' && typeof source.path === 'string') {
    return request as HeartbeatRunRequest;
  }

  throw requestError('source must contain an inline script or project path');
}

function runOptions(
  request: HeartbeatRunRequest,
  eventsOutputFD: number
): RunOptions {
  const options = request.options ?? {};
  return {
    reporter: 'json',
    outfd: eventsOutputFD,
    quietExitCode: true,
    ssblocks: true,
    network: true,
    trace: true,
    screenshots: 'on',
    params: options.params,
    grepOpts: {
      tags: options.tags,
      match: options.match,
    },
    playwrightOptions: {
      ...options.playwrightOptions,
      ...(options.ignoreHTTPSErrors === undefined
        ? {}
        : { ignoreHTTPSErrors: options.ignoreHTTPSErrors }),
    },
  };
}

function loaderOptions(request: HeartbeatRunRequest): CliArgs {
  const options = request.options ?? {};
  return {
    inline: request.source.type === 'inline',
    inlineApi: request.source.type === 'inline',
    params: options.params,
    tags: options.tags,
    match: options.match,
    playwrightOptions: options.playwrightOptions,
    ignoreHttpsErrors: options.ignoreHTTPSErrors,
  };
}

function setCrosslinkEnv(context: HeartbeatRunContext = {}) {
  const previous = new Map<string, string | undefined>();
  for (const [contextKey, envKey] of Object.entries(crosslinkEnv)) {
    previous.set(envKey, process.env[envKey]);
    const value = context[contextKey as keyof HeartbeatRunContext];
    if (value) {
      process.env[envKey] = value;
    } else {
      delete process.env[envKey];
    }
  }

  return () => {
    for (const [envKey, value] of previous) {
      if (value === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = value;
      }
    }
  };
}

function unloadProjectModules(projectPath: string) {
  const root = `${resolve(projectPath)}${sep}`;
  for (const filename of Object.keys(require.cache)) {
    if (filename === root.slice(0, -1) || filename.startsWith(root)) {
      delete require.cache[filename];
    }
  }
}

export async function runHeartbeatRequest(
  request: HeartbeatRunRequest,
  eventsOutputFD = eventFD
) {
  const restoreEnv = setCrosslinkEnv(request.context);
  const sourceArgs =
    request.source.type === 'project' ? [request.source.path] : [];
  let teardown: (() => void) | undefined;

  try {
    teardown = await globalSetup(
      loaderOptions(request),
      sourceArgs,
      request.source.type === 'inline' ? request.source.script : undefined
    );
    return await runner._run(runOptions(request, eventsOutputFD));
  } finally {
    teardown?.();
    if (request.source.type === 'project') {
      unloadProjectModules(request.source.path);
    }
    restoreEnv();
  }
}

// serveHeartbeat processes one request at a time because the global Synthetics
// runner is intentionally single-flight. The parent process can start multiple
// runners if a higher concurrency limit is required.
export async function serveHeartbeat(
  input: NodeJS.ReadableStream = stdin,
  controlOutputFD = controlFD,
  eventsOutputFD = eventFD
) {
  writeControl({ type: 'ready', version: protocolVersion }, controlOutputFD);
  const lines = createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    let request: HeartbeatRunRequest | undefined;
    try {
      request = parseHeartbeatRunRequest(JSON.parse(line));
      await runHeartbeatRequest(request, eventsOutputFD);
      writeCompletion(request.id, eventsOutputFD);
      writeControl({ id: request.id, type: 'completed' }, controlOutputFD);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeControl(
        {
          id: request?.id ?? 'unknown',
          type: 'error',
          error: { message },
        },
        controlOutputFD
      );
    }
  }
}
