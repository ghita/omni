import { createCopilotRunnerWithConfiguredAgents, runCopilotTaskWithConfiguredAgents, CopilotRunner } from './copilot';
import { CliDashboard } from './output';
import { OperationalEvent } from './events';
import { CustomAgentConfig, TelemetryConfig } from '@github/copilot-sdk';
import * as readline from 'node:readline';
import { createSessionTraceContext } from './tracing.js';
export { runDialogueMode } from './dialogueMode';

export type OperationalEventHandler = (event: OperationalEvent) => void;

export type CreateRunnerFn = (
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  telemetry: TelemetryConfig | undefined,
  handlers: { onOperationalEvent?: OperationalEventHandler },
  traceContextProvider: () => { traceparent?: string; tracestate?: string },
) => Promise<CopilotRunner>;

export type PromptFn = (question: string) => Promise<string>;

export function buildEventHandler(
  visualizeEvents: boolean,
  interactiveMode: boolean,
  dashboard: CliDashboard,
): OperationalEventHandler {
  return (event: OperationalEvent) => {
    if (!visualizeEvents) {
      return;
    }

    if (interactiveMode) {
      dashboard.addEvent(event);
      return;
    }

    dashboard.printLinearEvent(event);
  };
}

export async function runInteractiveMode(
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  visualizeEvents: boolean,
  dashboard: CliDashboard,
  onOperationalEvent: OperationalEventHandler,
  telemetryConfig?: TelemetryConfig,
  createRunner: CreateRunnerFn = createCopilotRunnerWithConfiguredAgents,
  promptFn?: PromptFn,
) {
  const sessionTraceContext = createSessionTraceContext();

  const runner = await createRunner(
    agents,
    resume,
    toolNames,
    telemetryConfig,
    { onOperationalEvent },
    () => sessionTraceContext,
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = promptFn ?? ((q: string) => new Promise<string>((resolve) => rl.question(q, resolve)));

  dashboard.setStatus('ready');
  if (!visualizeEvents) {
    console.log('Interactive mode started. Type "exit" to quit.');
  }

  try {
    while (true) {
      const input = await prompt('You: ');
      const trimmedInput = input.trim();
      if (!trimmedInput) {
        continue;
      }
      if (trimmedInput.toLowerCase() === 'exit') {
        break;
      }

      dashboard.setStatus('waiting for assistant');
      dashboard.clearStreamingContent();

      let assistantReply = '';
      if (visualizeEvents) {
        // Use streaming for interactive dashboard mode
        assistantReply = (await runner.sendTaskStreaming(trimmedInput, (chunk) => {
          dashboard.appendStreamingContent(chunk);
        })) ?? '';
        dashboard.finalizeStreamingContent();
      } else {
        // Non-visual mode: stream directly to console
        process.stdout.write('Assistant: ');
        assistantReply = (await runner.sendTaskStreaming(trimmedInput, (chunk) => {
          process.stdout.write(chunk);
        })) ?? '';
        process.stdout.write('\n');
        dashboard.setLastExchange(trimmedInput, assistantReply);
      }

      dashboard.setStatus('ready');
    }
  } finally {
    rl.close();
    await runner.close();
  }
}

export type RunCopilotTaskFn = (
  task: string,
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  telemetry: TelemetryConfig | undefined,
  handlers: { onOperationalEvent?: OperationalEventHandler },
) => Promise<string | undefined>;

export async function runOneShotMode(
  task: string,
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  onOperationalEvent: OperationalEventHandler,
  telemetryConfig?: TelemetryConfig,
  runTask: RunCopilotTaskFn = runCopilotTaskWithConfiguredAgents,
) {
  const result = await runTask(task, agents, resume, toolNames, telemetryConfig, {
    onOperationalEvent,
  });

  process.stdout.write(`${result ?? ''}\n`);
}
