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

import { SpanStatusCode, Tracer, Span, SpanContext } from '@opentelemetry/api';
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPGrpcExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPProtoExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  defaultResource,
  detectResources,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';
import { log } from './logger';

export type OTelJourneyTrace = {
  rootSpan: Span;
  steps: Map<number, Span>;
  stepContexts: Map<number, SpanContext>;
};

export type OTelRuntime = {
  tracer: Tracer;
  provider: NodeTracerProvider;
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
}

function isConsoleExporter(): boolean {
  return process.env['OTEL_TRACES_EXPORTER'] === 'console';
}

function getOtlpProtocol(): string {
  // Check for traces-specific protocol setting first
  const tracesProtocol = process.env['OTEL_EXPORTER_OTLP_TRACES_PROTOCOL'];
  if (tracesProtocol) {
    return tracesProtocol;
  }

  // Fall back to general OTEL protocol setting
  const generalProtocol = process.env['OTEL_EXPORTER_OTLP_PROTOCOL'];
  if (generalProtocol) {
    return generalProtocol;
  }

  // Default to http/json for backward compatibility
  return 'http/json';
}

function createSpanProcessor() {
  if (isConsoleExporter()) {
    return new SimpleSpanProcessor(new ConsoleSpanExporter());
  }

  const protocol = getOtlpProtocol();
  let exporter;

  // Create appropriate exporter based on protocol
  switch (protocol) {
    case 'grpc':
      exporter = new OTLPGrpcExporter();
      break;
    case 'http/json':
      exporter = new OTLPHttpExporter();
      break;
    case 'http/protobuf':
      exporter = new OTLPProtoExporter();
      break;
    default:
      // Default to http/json if unknown protocol
      exporter = new OTLPHttpExporter();
  }

  // The OTLP exporters consume standard OTEL_* env vars.
  return new BatchSpanProcessor(exporter);
}

function activeEndpoint() {
  const tracesEndpoint = process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
  if (tracesEndpoint) {
    return tracesEndpoint;
  }

  const baseEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (baseEndpoint) {
    return `${baseEndpoint.replace(/\/+$/, '')}/v1/traces`;
  }

  return 'http://localhost:4318/v1/traces';
}

export function createOTelRuntime(enabled: boolean): OTelRuntime | undefined {
  if (!enabled) {
    return;
  }

  const sdkDisabled = parseBoolean(process.env['OTEL_SDK_DISABLED']);
  if (sdkDisabled) {
    return;
  }

  const protocol = getOtlpProtocol();
  console.error(
    `[otel] enabled, exporting traces to ${activeEndpoint()} via ${protocol} (set OTEL_TRACES_EXPORTER=console to verify locally, or OTEL_EXPORTER_OTLP_PROTOCOL=grpc|http/json|http/protobuf)`
  );

  const detectedResource = detectResources({
    detectors: [
      envDetector,
      processDetector,
      hostDetector,
      osDetector,
      serviceInstanceIdDetector,
    ],
  });
  const resource = defaultResource().merge(detectedResource);

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [createSpanProcessor()],
  });
  provider.register();

  return {
    provider,
    tracer: provider.getTracer('@elastic/synthetics'),
  };
}

export function setOTelStatusFromError(span: Span, error: any) {
  if (!error) {
    span.setStatus({ code: SpanStatusCode.OK });
    return;
  }
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
}

export async function shutdownOTel(runtime?: OTelRuntime) {
  log('Shutting down OpenTelemetry runtime');
  await runtime?.provider.shutdown();
}

export async function flushOTel(runtime?: OTelRuntime) {
  await runtime?.provider.forceFlush();
}
