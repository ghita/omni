import { OperationalEvent } from './copilot';

type DashboardOptions = {
  enabled: boolean;
  maxEvents?: number;
};

function formatTimestamp(iso: string): string {
  if (iso.length >= 19) {
    return iso.substring(11, 19); // HH:MM:SS
  }
  return iso;
}

function statusIcon(status?: string): string {
  switch (status) {
    case 'running': return '▶';
    case 'success': return '✓';
    case 'error':   return '✗';
    default:        return '•';
  }
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

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.substring(0, maxLen)}…` : s;
}

// A simple CLI dashboard that can visualize operational events and show the latest user prompt and assistant reply. 
// In interactive mode, it renders a dashboard in the terminal. 
// In non-interactive mode or when visualization is disabled, it prints events linearly to stderr.
export class CliDashboard {
  private readonly enabled: boolean;
  private readonly maxEvents: number;
  private readonly events: string[] = [];
  private readonly executionOrder: string[] = [];
  private readonly executionNodes = new Map<string, ExecutionNode>();
  private readonly activeToolStack: string[] = [];
  private lastUserPrompt = '';
  private lastAssistantReply = '';
  private status = 'idle';

  constructor(options: DashboardOptions) {
    this.enabled = options.enabled;
    this.maxEvents = options.maxEvents ?? 8;
  }

  setStatus(status: string) {
    this.status = status;
    this.render();
  }

  setLastExchange(userPrompt: string, assistantReply: string) {
    this.lastUserPrompt = userPrompt;
    this.lastAssistantReply = assistantReply;
    this.render();
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

    this.render();
  }

  // In non-interactive mode or when visualization is disabled, print events linearly to stderr with a simple format.
  printLinearEvent(event: OperationalEvent) {
    const icon = statusIcon(event.status);
    const time = formatTimestamp(event.timestamp);
    process.stderr.write(`[event] ${time} ${icon} ${event.summary}\n`);
    if (event.toolCallId) {
      process.stderr.write(`  toolCallId: ${event.toolCallId}\n`);
    }
    for (const detail of event.details ?? []) {
      process.stderr.write(`  ${detail}\n`);
    }
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

  // Removes a tool from the active tool stack.
  private removeToolFromStack(toolCallId: string) {
    for (let i = this.activeToolStack.length - 1; i >= 0; i -= 1) {
      if (this.activeToolStack[i] === toolCallId) {
        this.activeToolStack.splice(i, 1);
        return;
      }
    }
  }

  private renderExecutionLines(lines: string[]) {
    lines.push('Execution');
    lines.push('---------');
    if (this.executionOrder.length === 0) {
      lines.push('No tracked execution yet.');
      return;
    }

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
      lines.push(
        `${prefix}${icon} [${kindLabel}] ${node.label} (${node.toolCallId}) ${timeRange}${errorSuffix}`
      );
    }
  }

  // Renders the dashboard in the terminal. Clears the terminal and redraws the entire dashboard on each render.
  render() {
    if (!this.enabled || !process.stdout.isTTY) {
      return;
    }

    const lines: string[] = [];
    lines.push('Events');
    lines.push('------');
    if (this.events.length === 0) {
      lines.push('No events yet.');
    } else {
      lines.push(...this.events);
    }

    lines.push('');
    this.renderExecutionLines(lines);
    lines.push('');
    lines.push('Conversation');
    lines.push('------------');
    lines.push(`Status: ${this.status}`);
    if (this.lastUserPrompt) {
      lines.push(`You: ${this.lastUserPrompt}`);
    }
    if (this.lastAssistantReply) {
      lines.push(`Assistant: ${this.lastAssistantReply}`);
    }

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`${lines.join('\n')}\n\n`);
  }
}
