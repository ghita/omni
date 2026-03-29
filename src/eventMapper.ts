import { OperationalEvent } from './events';

export type SessionEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp?: unknown;
};

function nowIsoTimestamp() {
  return new Date().toISOString();
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.substring(0, maxLen)}…` : s;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventTimestamp(event: { timestamp?: unknown }): string {
  return stringFrom(event.timestamp) ?? nowIsoTimestamp();
}

export function createEventMapper() {
  const toolCallMap = new Map<string, string>();

  return function mapSessionEventToOperationalEvent(event: SessionEvent): OperationalEvent | undefined {
    const timestamp = eventTimestamp(event);

    switch (event.type) {
      case 'session.start':
        return {
          timestamp,
          type: event.type,
          status: 'info',
          summary: 'Session started',
          category: 'session',
          phase: 'start',
        };
      case 'subagent.started':
        return {
          timestamp,
          type: event.type,
          status: 'running',
          summary: `Agent: ${String(event.data.agentDisplayName ?? 'unknown')}`,
          category: 'subagent',
          phase: 'start',
          toolCallId: stringFrom(event.data.toolCallId),
          agentName: stringFrom(event.data.agentName),
          agentDisplayName: stringFrom(event.data.agentDisplayName),
          agentDescription: stringFrom(event.data.agentDescription),
        };
      case 'subagent.completed':
        return {
          timestamp,
          type: event.type,
          status: 'success',
          summary: `Agent done: ${String(event.data.agentDisplayName ?? 'unknown')}`,
          category: 'subagent',
          phase: 'complete',
          toolCallId: stringFrom(event.data.toolCallId),
          agentName: stringFrom(event.data.agentName),
          agentDisplayName: stringFrom(event.data.agentDisplayName),
        };
      case 'subagent.failed':
        return {
          timestamp,
          type: event.type,
          status: 'error',
          summary: `Agent failed: ${String(event.data.agentDisplayName ?? 'unknown')} — ${truncate(String(event.data.error ?? ''), 60)}`,
          category: 'subagent',
          phase: 'complete',
          toolCallId: stringFrom(event.data.toolCallId),
          agentName: stringFrom(event.data.agentName),
          agentDisplayName: stringFrom(event.data.agentDisplayName),
          error: stringFrom(event.data.error),
        };
      case 'subagent.selected':
        return {
          timestamp,
          type: event.type,
          status: 'info',
          summary: `Selected: ${String(event.data.agentDisplayName ?? 'unknown')}`,
          category: 'subagent',
          phase: 'selected',
          agentName: stringFrom(event.data.agentName),
          agentDisplayName: stringFrom(event.data.agentDisplayName),
        };
      case 'subagent.deselected':
        return {
          timestamp,
          type: event.type,
          status: 'info',
          summary: 'Agent deselected',
          category: 'subagent',
          phase: 'deselected',
        };
      case 'tool.execution_start': {
        const toolName = String(event.data.toolName ?? 'unknown');
        const callId = stringFrom(event.data.toolCallId) ?? '';
        if (callId) {
          toolCallMap.set(callId, toolName);
        }
        const args = event.data.arguments as Record<string, unknown> | undefined;
        const description = typeof args?.description === 'string' ? args.description : undefined;
        const command = typeof args?.command === 'string' ? args.command : undefined;
        const label = description ?? (command ? truncate(command, 60) : undefined) ?? toolName;

        return {
          timestamp,
          type: event.type,
          status: 'running',
          summary: `${toolName}: ${label}`,
          category: 'tool',
          phase: 'start',
          toolCallId: callId || undefined,
          toolName,
        };
      }
      case 'tool.execution_complete': {
        const callId = stringFrom(event.data.toolCallId) ?? '';
        const toolName = toolCallMap.get(callId) ?? String(event.data.toolName ?? 'tool');
        if (callId) {
          toolCallMap.delete(callId);
        }
        const result = event.data.result as { detailedContent?: unknown; content?: unknown } | undefined;
        const raw = String(result?.detailedContent ?? result?.content ?? '');
        const firstLine = raw.split('\n').find((l) => l.trim()) ?? '';
        const hasError = /error|fail|exception/i.test(raw) && !/exit code 0/i.test(raw);

        return {
          timestamp,
          type: event.type,
          status: hasError ? 'error' : 'success',
          summary: firstLine
            ? `${toolName} → ${truncate(firstLine, 60)}`
            : `${toolName} completed`,
          category: 'tool',
          phase: 'complete',
          toolCallId: callId || undefined,
          toolName,
        };
      }
      default:
        return undefined;
    }
  };
}
