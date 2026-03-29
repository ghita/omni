import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OperationalEvent } from './events';

type LoggedTurn = {
  timestamp: string;
  prompt: string;
  assistantReply: string;
};

type SessionActivityLog = {
  schemaVersion: number;
  session: {
    id: string;
    resumed: boolean;
    model: string;
    folder: string;
    file: string;
    startedAt: string;
    endedAt: string;
  };
  stats: {
    totalEvents: number;
    totalTurns: number;
  };
  events: OperationalEvent[];
  turns: LoggedTurn[];
};

function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function resolveBaseSessionFolder(): string {
  if (process.env.COPILOT_SESSION_FOLDER) {
    return process.env.COPILOT_SESSION_FOLDER;
  }
  return path.join(os.homedir(), '.copilot', 'session-state');
}

export class SessionActivityLogger {
  private readonly sessionId: string;
  private readonly sessionFolder: string;
  private readonly sessionFilePath: string;
  private readonly startedAt: string;
  private readonly resumed: boolean;
  private readonly model: string;
  private readonly events: OperationalEvent[] = [];
  private readonly turns: LoggedTurn[] = [];

  constructor(options: { resumeSessionId?: string; model: string }) {
    const generatedId = `omni-${Date.now()}-${randomUUID().substring(0, 8)}`;
    this.sessionId = sanitizeSegment(options.resumeSessionId ?? generatedId);
    this.sessionFolder = path.join(resolveBaseSessionFolder(), this.sessionId);
    this.sessionFilePath = path.join(this.sessionFolder, 'session-activity.json');
    this.startedAt = nowIsoTimestamp();
    this.resumed = Boolean(options.resumeSessionId);
    this.model = options.model;
  }

  getFilePath(): string {
    return this.sessionFilePath;
  }

  recordEvent(event: OperationalEvent): void {
    this.events.push(event);
  }

  recordTurn(prompt: string, assistantReply: string): void {
    this.turns.push({
      timestamp: nowIsoTimestamp(),
      prompt,
      assistantReply,
    });
  }

  async flush(): Promise<void> {
    await fs.mkdir(this.sessionFolder, { recursive: true });
    const payload: SessionActivityLog = {
      schemaVersion: 1,
      session: {
        id: this.sessionId,
        resumed: this.resumed,
        model: this.model,
        folder: this.sessionFolder,
        file: this.sessionFilePath,
        startedAt: this.startedAt,
        endedAt: nowIsoTimestamp(),
      },
      stats: {
        totalEvents: this.events.length,
        totalTurns: this.turns.length,
      },
      events: this.events,
      turns: this.turns,
    };
    await fs.writeFile(this.sessionFilePath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}
