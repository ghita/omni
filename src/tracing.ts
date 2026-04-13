import { context, propagation } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';
import { randomBytes } from 'node:crypto';

/**
 * Gets the current W3C Trace Context for propagation to the Copilot CLI.
 * This is used by the SDK's onGetTraceContext callback.
 */
export function getTraceContext(): { traceparent?: string; tracestate?: string } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  };
}

/**
 * Creates one stable W3C Trace Context for an interactive CLI session.
 * This keeps all session.create/session.send RPCs in the same distributed trace
 * even when the host process does not run its own OpenTelemetry SDK.
 */
export function createSessionTraceContext(): { traceparent: string } {
  const activeContext = getTraceContext();
  if (activeContext.traceparent) {
    return { traceparent: activeContext.traceparent };
  }

  const traceId = randomNonZeroHex(16);
  const spanId = randomNonZeroHex(8);
  return {
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

function randomNonZeroHex(byteLength: number): string {
  let value = '';
  while (!value || /^0+$/.test(value)) {
    value = randomBytes(byteLength).toString('hex');
  }
  return value;
}

export { context, Context };
