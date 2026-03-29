import { DashboardSnapshot } from './outputState';

export class DashboardRenderer {
  render(snapshot: DashboardSnapshot) {
    if (!process.stdout.isTTY) {
      return;
    }

    const lines: string[] = [];
    lines.push('Events');
    lines.push('------');
    if (snapshot.events.length === 0) {
      lines.push('No events yet.');
    } else {
      lines.push(...snapshot.events);
    }

    lines.push('');
    lines.push('Execution');
    lines.push('---------');
    lines.push(...snapshot.executionLines);

    lines.push('');
    lines.push('Conversation');
    lines.push('------------');
    lines.push(`Status: ${snapshot.status}`);
    if (snapshot.lastUserPrompt) {
      lines.push(`You: ${snapshot.lastUserPrompt}`);
    }
    if (snapshot.lastAssistantReply) {
      lines.push(`Assistant: ${snapshot.lastAssistantReply}`);
    }

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`${lines.join('\n')}\n\n`);
  }
}
