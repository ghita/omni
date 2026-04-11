import { TelemetryConfig } from '@github/copilot-sdk';

export type CliTelemetryOptions = {
  telemetryOtlpEndpoint?: string;
  telemetrySourceName?: string;
  telemetryExporterType?: string;
  telemetryFilePath?: string;
  telemetryCaptureContent?: boolean;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeTelemetryConfig(options: CliTelemetryOptions): TelemetryConfig | undefined {
  const otlpEndpoint = normalizeOptionalString(options.telemetryOtlpEndpoint);
  const filePath = normalizeOptionalString(options.telemetryFilePath);
  if (!otlpEndpoint && !filePath) {
    return undefined;
  }

  const exporterType = normalizeOptionalString(options.telemetryExporterType);
  const sourceName = normalizeOptionalString(options.telemetrySourceName);

  return {
    ...(otlpEndpoint ? { otlpEndpoint } : {}),
    ...(filePath ? { filePath } : {}),
    ...(exporterType ? { exporterType } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(options.telemetryCaptureContent !== undefined
      ? { captureContent: options.telemetryCaptureContent }
      : {}),
  };
}

export function describeTelemetryConfig(config: TelemetryConfig): string[] {
  const serviceName = normalizedServiceNameFromTelemetry(config);
  return [
    config.otlpEndpoint ? `otlpEndpoint=${config.otlpEndpoint}` : undefined,
    config.filePath ? `filePath=${config.filePath}` : undefined,
    config.exporterType ? `exporterType=${config.exporterType}` : undefined,
    config.sourceName ? `sourceName=${config.sourceName}` : undefined,
    serviceName ? `serviceName=${serviceName}` : undefined,
    config.captureContent !== undefined ? `captureContent=${String(config.captureContent)}` : undefined,
  ].filter((value): value is string => Boolean(value));
}

export function normalizedServiceNameFromTelemetry(config: TelemetryConfig): string | undefined {
  return normalizeOptionalString(config.sourceName);
}
