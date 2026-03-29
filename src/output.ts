import { OperationalEvent } from './events';
import { DashboardRenderer } from './outputRenderer';
import { DashboardState } from './outputState';

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

  constructor(options: DashboardOptions) {
    this.enabled = options.enabled;
    this.state = new DashboardState({ maxEvents: options.maxEvents });
    this.renderer = new DashboardRenderer();
  }

  setStatus(status: string) {
    this.state.setStatus(status);
    this.render();
  }

  setLastExchange(userPrompt: string, assistantReply: string) {
    this.state.setLastExchange(userPrompt, assistantReply);
    this.render();
  }

  addEvent(event: OperationalEvent) {
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
  render() {
    if (!this.enabled || !process.stdout.isTTY) {
      return;
    }

    this.renderer.render(this.state.getSnapshot());
  }
}
