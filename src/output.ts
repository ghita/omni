import { OperationalEvent } from './copilot';

type DashboardOptions = {
  enabled: boolean;
  maxEvents?: number;
};

// A simple CLI dashboard that can visualize operational events and show the latest user prompt and assistant reply. 
// In interactive mode, it renders a dashboard in the terminal. 
// In non-interactive mode or when visualization is disabled, it prints events linearly to stderr.
export class CliDashboard {
  private readonly enabled: boolean;
  private readonly maxEvents: number;
  private readonly events: string[] = [];
  private lastUserPrompt = '';
  private lastAssistantReply = '';
  private status = 'idle';

  constructor(options: DashboardOptions) {
    this.enabled = options.enabled;
    this.maxEvents = options.maxEvents ?? 12;
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
    const baseLine = `${event.timestamp} | ${event.summary}`;
    this.events.push(baseLine);
    for (const detail of event.details ?? []) {
      this.events.push(`  ${detail}`);
    }

    if (this.events.length > this.maxEvents) {
      const overflow = this.events.length - this.maxEvents;
      this.events.splice(0, overflow);
    }

    this.render();
  }

  // In non-interactive mode or when visualization is disabled, print events linearly to stderr with a simple format.
  printLinearEvent(event: OperationalEvent) {
    process.stderr.write(`[event] ${event.timestamp} ${event.summary}\n`);
    for (const detail of event.details ?? []) {
      process.stderr.write(`  ${detail}\n`);
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
