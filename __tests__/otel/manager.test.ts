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
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter as OTLPGrpcExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPProtoExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter as OTLPMetricGrpcExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPMetricExporter as OTLPMetricHttpExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as OTLPMetricProtoExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { DurationSpanProcessor } from '../../src/otel/duration-span-processor';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { initOtel } from '../../src/otel/manager';

jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/sdk-trace-base');
jest.mock('@opentelemetry/exporter-trace-otlp-grpc');
jest.mock('@opentelemetry/exporter-trace-otlp-http');
jest.mock('@opentelemetry/exporter-trace-otlp-proto');
jest.mock('@opentelemetry/exporter-metrics-otlp-grpc');
jest.mock('@opentelemetry/exporter-metrics-otlp-http');
jest.mock('@opentelemetry/exporter-metrics-otlp-proto');
jest.mock('@opentelemetry/sdk-metrics');
jest.mock('../../src/otel/duration-span-processor');

describe('otel manager', () => {
  afterEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
  });

  it('should start and shutdown sdk', async () => {
    const shutdownMock = jest.fn().mockResolvedValue(undefined);
    (NodeSDK as jest.Mock).mockImplementation(() => ({
      start: jest.fn(),
      shutdown: shutdownMock,
    }));
    const otel = initOtel('synthetics', '1.0.0');
    await otel.shutdown();
    expect(shutdownMock).toHaveBeenCalled();
  });

  it('should init grpc manager', () => {
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc';
    const otel = initOtel('synthetics', '1.0.0');
    expect(otel).toBeTruthy();
    expect(NodeSDK).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        attributes: {
          [ATTR_SERVICE_NAME]: 'synthetics',
          [ATTR_SERVICE_VERSION]: '1.0.0',
        },
      }),
      resourceDetectors: expect.any(Array),
      traceExporter: expect.any(OTLPGrpcExporter),
      spanProcessors: [
        expect.any(BatchSpanProcessor),
        expect.any(DurationSpanProcessor),
      ],
      metricReaders: [expect.any(PeriodicExportingMetricReader)],
      views: expect.any(Array),
    });
    expect(BatchSpanProcessor).toBeCalledWith(expect.any(OTLPGrpcExporter));
    expect(PeriodicExportingMetricReader).toBeCalledWith({
      exporter: expect.any(OTLPMetricGrpcExporter),
    });
  });

  it('should init http manager', () => {
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
    const otel = initOtel('synthetics', '1.0.0');
    expect(otel).toBeTruthy();
    expect(NodeSDK).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        attributes: {
          [ATTR_SERVICE_NAME]: 'synthetics',
          [ATTR_SERVICE_VERSION]: '1.0.0',
        },
      }),
      resourceDetectors: expect.any(Array),
      traceExporter: expect.any(OTLPHttpExporter),
      spanProcessors: [
        expect.any(BatchSpanProcessor),
        expect.any(DurationSpanProcessor),
      ],
      metricReaders: [expect.any(PeriodicExportingMetricReader)],
      views: expect.any(Array),
    });
    expect(BatchSpanProcessor).toBeCalledWith(expect.any(OTLPHttpExporter));
    expect(PeriodicExportingMetricReader).toBeCalledWith({
      exporter: expect.any(OTLPMetricHttpExporter),
    });
  });

  ['http/protobuf', undefined].forEach(protocol => {
    it(`should init proto manager when env var is ${String(protocol)}`, () => {
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
      const otel = initOtel('synthetics', '1.0.0');
      expect(otel).toBeTruthy();
      expect(NodeSDK).toHaveBeenCalledWith({
        resource: expect.objectContaining({
          attributes: {
            [ATTR_SERVICE_NAME]: 'synthetics',
            [ATTR_SERVICE_VERSION]: '1.0.0',
          },
        }),
        resourceDetectors: expect.any(Array),
        traceExporter: expect.any(OTLPProtoExporter),
        spanProcessors: [
          expect.any(BatchSpanProcessor),
          expect.any(DurationSpanProcessor),
        ],
        metricReaders: [expect.any(PeriodicExportingMetricReader)],
        views: expect.any(Array),
      });
      expect(BatchSpanProcessor).toBeCalledWith(expect.any(OTLPProtoExporter));
      expect(PeriodicExportingMetricReader).toBeCalledWith({
        exporter: expect.any(OTLPMetricProtoExporter),
      });
    });
  });
});
