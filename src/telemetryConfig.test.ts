import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTelemetryConfig, normalizeTelemetryConfig } from './telemetryConfig';

test('normalizeTelemetryConfig returns undefined when endpoint and file path are both missing', () => {
  const config = normalizeTelemetryConfig({
    telemetrySourceName: 'omni-cli',
    telemetryExporterType: 'otlp-http',
    telemetryCaptureContent: true,
  });

  assert.equal(config, undefined);
});

test('normalizeTelemetryConfig keeps OTLP settings and trims values', () => {
  const config = normalizeTelemetryConfig({
    telemetryOtlpEndpoint: '  http://localhost:4318  ',
    telemetrySourceName: ' omni ',
    telemetryExporterType: ' otlp-http ',
    telemetryCaptureContent: true,
  });

  assert.deepEqual(config, {
    otlpEndpoint: 'http://localhost:4318',
    sourceName: 'omni',
    exporterType: 'otlp-http',
    captureContent: true,
  });
});

test('normalizeTelemetryConfig supports file exporter mode', () => {
  const config = normalizeTelemetryConfig({
    telemetryFilePath: '  C:\\temp\\omni-traces.jsonl  ',
    telemetryExporterType: 'file',
  });

  assert.deepEqual(config, {
    filePath: 'C:\\temp\\omni-traces.jsonl',
    exporterType: 'file',
  });
});

test('describeTelemetryConfig formats readable details', () => {
  const details = describeTelemetryConfig({
    otlpEndpoint: 'http://localhost:4318',
    sourceName: 'omni',
    captureContent: true,
  });

  assert.deepEqual(details, [
    'otlpEndpoint=http://localhost:4318',
    'sourceName=omni',
    'serviceName=omni',
    'captureContent=true',
  ]);
});
