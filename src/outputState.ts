import { OperationalEvent } from './events';

function formatTimestamp(iso: string): string {
  if (iso.length >= 19) {
    return iso.substring(11, 19);
  }
  return iso;
}

function statusIcon(status?: string): string {
  switch (status) {
    case 'running':
      return '▶';
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '•';
  }
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.substring(0, maxLen)}…` : s;
}

type ExecutionNode = {
  id: string;
  kind: 'tool' | 'subagent';
  toolCallId: string;
  label: string;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  completedAt?: string;
  parentId?: string;
  error?: string;
};

export type DashboardSnapshot = {
  events: string[];
  executionLines: string[];
  status: string;
  lastUserPrompt: string;
  lastAssistantReply: string;
  isStreaming: boolean;
};

export class DashboardState {
  private readonly maxEvents: number;
  private readonly events: string[] = [];
  private readonly executionOrder: string[] = [];
  private readonly executionNodes = new Map<string, ExecutionNode>();
  private readonly activeToolStack: string[] = [];
  private status = 'idle';
  private lastUserPrompt = '';
  private lastAssistantReply = '';
  private streamingContent = '';
  private isStreaming = false;

  constructor(options: { maxEvents?: number }) {
    this.maxEvents = options.maxEvents ?? 8;
  }

  setStatus(status: string) {
    this.status = status;
  }

  setLastExchange(userPrompt: string, assistantReply: string) {
    this.lastUserPrompt = userPrompt;
    this.lastAssistantReply = assistantReply;
  }

  appendStreamingContent(chunk: string) {
    this.streamingContent += chunk;
    this.isStreaming = true;
  }

  finalizeStreamingContent() {
    this.lastAssistantReply = this.streamingContent;
    this.streamingContent = '';
    this.isStreaming = false;
  }

  clearStreamingContent() {
    this.streamingContent = '';
    this.isStreaming = false;
  }

  addEvent(event: OperationalEvent) {
    const icon = statusIcon(event.status);
    const time = formatTimestamp(event.timestamp);
    this.events.push(`${time} ${icon} ${event.summary}`);
    this.trackExecution(event);

    if (this.events.length > this.maxEvents) {
      const overflow = this.events.length - this.maxEvents;
      this.events.splice(0, overflow);
    }
  }

  formatLinearEvent(event: OperationalEvent): string[] {
    const icon = statusIcon(event.status);
    const time = formatTimestamp(event.timestamp);
    const lines = [`[event] ${time} ${icon} ${event.summary}`];
    if (event.toolCallId) {
      lines.push(`  toolCallId: ${event.toolCallId}`);
    }
    for (const detail of event.details ?? []) {
      lines.push(`  ${detail}`);
    }
    return lines;
  }

  getSnapshot(): DashboardSnapshot {
    return {
      events: [...this.events],
      executionLines: this.renderExecutionLines(),
      status: this.status,
      lastUserPrompt: this.lastUserPrompt,
      lastAssistantReply: this.isStreaming ? this.streamingContent : this.lastAssistantReply,
      isStreaming: this.isStreaming,
    };
  }

  private trackExecution(event: OperationalEvent) {
    if (event.category === 'tool' && event.toolCallId) {
      const id = `tool:${event.toolCallId}`;
      const existing = this.executionNodes.get(id);

      if (event.phase === 'start') {
        const parentToolCallId = this.activeToolStack[this.activeToolStack.length - 1];
        const parentId = parentToolCallId ? `tool:${parentToolCallId}` : undefined;
        const node: ExecutionNode = existing ?? {
          id,
          kind: 'tool',
          toolCallId: event.toolCallId,
          label: event.toolName ?? event.summary,
          status: 'running',
          startedAt: event.timestamp,
          parentId,
        };
        node.label = event.toolName ?? node.label;
        node.status = 'running';
        node.startedAt = existing?.startedAt ?? event.timestamp;
        node.parentId = node.parentId ?? parentId;
        this.upsertExecutionNode(node);
        if (!this.activeToolStack.includes(event.toolCallId)) {
          this.activeToolStack.push(event.toolCallId);
        }
      }

      if (event.phase === 'complete') {
        const node: ExecutionNode = existing ?? {
          id,
          kind: 'tool',
          toolCallId: event.toolCallId,
          label: event.toolName ?? event.summary,
          status: 'success',
          startedAt: event.timestamp,
        };
        node.status = event.status === 'error' ? 'error' : 'success';
        node.completedAt = event.timestamp;
        node.label = event.toolName ?? node.label;
        this.upsertExecutionNode(node);
        this.removeToolFromStack(event.toolCallId);
      }
    }

    if (event.category === 'subagent' && event.toolCallId) {
      const subagentName = event.agentDisplayName ?? event.agentName ?? 'unknown';
      const id = `subagent:${event.toolCallId}:${subagentName}`;
      const existing = this.executionNodes.get(id);
      const parentId = `tool:${event.toolCallId}`;

      if (event.phase === 'start') {
        const node: ExecutionNode = existing ?? {
          id,
          kind: 'subagent',
          toolCallId: event.toolCallId,
          label: subagentName,
          status: 'running',
          startedAt: event.timestamp,
          parentId,
        };
        node.label = subagentName;
        node.status = 'running';
        node.parentId = node.parentId ?? parentId;
        node.startedAt = existing?.startedAt ?? event.timestamp;
        this.upsertExecutionNode(node);
      }

      if (event.phase === 'complete') {
        const node: ExecutionNode = existing ?? {
          id,
          kind: 'subagent',
          toolCallId: event.toolCallId,
          label: subagentName,
          status: 'success',
          startedAt: event.timestamp,
          parentId,
        };
        node.status = event.status === 'error' ? 'error' : 'success';
        node.completedAt = event.timestamp;
        node.error = event.error;
        this.upsertExecutionNode(node);
      }
    }
  }

  private upsertExecutionNode(node: ExecutionNode) {
    if (!this.executionNodes.has(node.id)) {
      this.executionOrder.push(node.id);
    }
    this.executionNodes.set(node.id, node);
  }

  private removeToolFromStack(toolCallId: string) {
    for (let i = this.activeToolStack.length - 1; i >= 0; i -= 1) {
      if (this.activeToolStack[i] === toolCallId) {
        this.activeToolStack.splice(i, 1);
        return;
      }
    }
  }

  private renderExecutionLines(): string[] {
    if (this.executionOrder.length === 0) {
      return ['No tracked execution yet.'];
    }

    const lines: string[] = [];
    for (const nodeId of this.executionOrder) {
      const node = this.executionNodes.get(nodeId);
      if (!node) {
        continue;
      }

      const icon = statusIcon(node.status);
      const prefix = node.kind === 'subagent' ? '  ↳ ' : '';
      const timeRange = node.completedAt
        ? `${formatTimestamp(node.startedAt)}→${formatTimestamp(node.completedAt)}`
        : `${formatTimestamp(node.startedAt)}→…`;
      const kindLabel = node.kind === 'tool' ? 'tool' : 'agent';
      const errorSuffix = node.error ? ` — ${truncate(node.error, 40)}` : '';
      lines.push(`${prefix}${icon} [${kindLabel}] ${node.label} (${node.toolCallId}) ${timeRange}${errorSuffix}`);
    }

    return lines;
  }
}
