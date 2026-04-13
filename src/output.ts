import { OperationalEvent } from './events';
import { DashboardRenderer } from './outputRenderer';
import { DashboardSnapshot, DashboardState } from './outputState';

type DashboardOptions = {
  enabled: boolean;
  maxEvents?: number;
};

// A simple CLI dashboard that can visualize operational events and show the latest user prompt and assistant reply. 
// In interactive mode, it renders a dashboard in the terminal. 
// In non-interactive mode or when visualization is disabled, it prints events linearly to stderr.
export class CliDashboard {
  private readonly enabled: boolean;
  private readonly state: DashboardState;
  private readonly renderer: DashboardRenderer;
  private lastRenderedSnapshot: DashboardSnapshot | null = null;

  constructor(options: DashboardOptions) {
    this.enabled = options.enabled;
    this.state = new DashboardState({ maxEvents: options.maxEvents });
    this.renderer = new DashboardRenderer();
  }

  setStatus(status: string) {
    if (!this.enabled) {
      return;
    }
    this.state.setStatus(status);
    this.render();
  }

  setLastExchange(userPrompt: string, assistantReply: string) {
    if (!this.enabled) {
      return;
    }
    this.state.setLastExchange(userPrompt, assistantReply);
    this.render();
  }

  appendStreamingContent(chunk: string) {
    if (!this.enabled) {
      process.stdout.write(chunk);
      return;
    }
    this.state.appendStreamingContent(chunk);
    this.render();
  }

  finalizeStreamingContent() {
    if (!this.enabled) {
      return;
    }
    this.state.finalizeStreamingContent();
    this.render();
  }

  clearStreamingContent() {
    if (!this.enabled) {
      return;
    }
    this.state.clearStreamingContent();
    this.render();
  }

  addEvent(event: OperationalEvent) {
    if (!this.enabled) {
      return;
    }
    this.state.addEvent(event);
    this.render();
  }

  // In non-interactive mode or when visualization is disabled, print events linearly to stderr with a simple format.
  printLinearEvent(event: OperationalEvent) {
    for (const line of this.state.formatLinearEvent(event)) {
      process.stderr.write(`${line}\n`);
    }
  }

  // Renders the dashboard in the terminal. Clears the terminal and redraws the entire dashboard on each render.
  // Skips rendering if nothing has changed since the last render.
  render() {
    if (!this.enabled || !process.stdout.isTTY) {
      return;
    }

    const snapshot = this.state.getSnapshot();
    if (this.snapshotsEqual(this.lastRenderedSnapshot, snapshot)) {
      return;
    }

    this.renderer.render(snapshot);
    this.lastRenderedSnapshot = snapshot;
  }

  private snapshotsEqual(a: DashboardSnapshot | null, b: DashboardSnapshot): boolean {
    if (!a) {
      return false;
    }
    return (
      a.status === b.status &&
      a.lastUserPrompt === b.lastUserPrompt &&
      a.lastAssistantReply === b.lastAssistantReply &&
      a.isStreaming === b.isStreaming &&
      this.arraysEqual(a.events, b.events) &&
      this.arraysEqual(a.executionLines, b.executionLines)
    );
  }

  private arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
}
