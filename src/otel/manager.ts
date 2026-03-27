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

import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter as OTLPGrpcExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPProtoExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter as OTLPMetricGrpcExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPMetricExporter as OTLPMetricHttpExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as OTLPMetricProtoExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import {
  AggregationType,
  InstrumentType,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { containerDetector } from '@opentelemetry/resource-detector-container';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  METRIC_HTTP_CLIENT_REQUEST_DURATION,
} from '@opentelemetry/semantic-conventions';
import { DurationSpanProcessor } from './';

const getOtlpProtocol = (type: 'traces' | 'metrics' | 'logs'): string => {
  let typeSpecificProtocol: string | undefined;
  switch (type) {
    case 'traces':
      typeSpecificProtocol = process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL;
      break;
    case 'metrics':
      typeSpecificProtocol = process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL;
      break;
    case 'logs':
      typeSpecificProtocol = process.env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL;
      break;
  }
  return (
    typeSpecificProtocol ||
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL ||
    'http/protobuf'
  );
};

const createTraceExporter = (): SpanExporter => {
  const protocol = getOtlpProtocol('traces');

  switch (protocol) {
    case 'grpc':
      return new OTLPGrpcExporter();
    case 'http/json':
      return new OTLPHttpExporter();
    case 'http/protobuf':
    default:
      return new OTLPProtoExporter();
  }
};

const createMetricReader = (): PeriodicExportingMetricReader => {
  const protocol = getOtlpProtocol('metrics');
  let exporter;

  switch (protocol) {
    case 'grpc':
      exporter = new OTLPMetricGrpcExporter();
      break;
    case 'http/json':
      exporter = new OTLPMetricHttpExporter();
      break;
    case 'http/protobuf':
    default:
      exporter = new OTLPMetricProtoExporter();
      break;
  }

  return new PeriodicExportingMetricReader({ exporter });
};

export type OtelManager = {
  //tracer: Tracer;
  //meter: Meter;
  shutdown: () => Promise<void>;
};

export const initOtel = (name: string, version: string): OtelManager => {
  // Allow overriding service name and version via environment variables
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: name,
    [ATTR_SERVICE_VERSION]: version,
  });
  const traceExporter = createTraceExporter();
  const metricReader = createMetricReader();
  const sdk = new NodeSDK({
    resource,
    resourceDetectors: [
      envDetector,
      processDetector,
      hostDetector,
      osDetector,
      containerDetector,
    ],
    traceExporter,
    spanProcessors: [
      new BatchSpanProcessor(traceExporter),
      new DurationSpanProcessor(),
    ],
    metricReaders: [metricReader],
    // TODO
    views: [
      {
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: {
            // https://opentelemetry.io/docs/specs/semconv/http/http-metrics/#http-server
            boundaries: [
              0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5,
              7.5, 10,
            ],
          },
        },
        instrumentName: METRIC_HTTP_CLIENT_REQUEST_DURATION,
        instrumentType: InstrumentType.HISTOGRAM,
      },
    ],
  });
  sdk.start();

  return {
    //tracer: trace.getTracer(name, version),
    //meter: metrics.getMeter(name, version),
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
};
