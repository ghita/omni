import { createCopilotRunnerWithConfiguredAgents, runCopilotTaskWithConfiguredAgents } from './copilot';
import { CliDashboard } from './output';
import { OperationalEvent } from './events';
import { CustomAgentConfig, TelemetryConfig } from '@github/copilot-sdk';
import * as readline from 'node:readline';
import { createSessionTraceContext } from './tracing.js';
export { runDialogueMode } from './dialogueMode';

export type OperationalEventHandler = (event: OperationalEvent) => void;

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
) {
  const sessionTraceContext = createSessionTraceContext();

  const runner = await createCopilotRunnerWithConfiguredAgents(
    agents,
    resume,
    toolNames,
    telemetryConfig,
    { onOperationalEvent },
    () => sessionTraceContext,
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

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
      const response = await runner.sendTask(trimmedInput);
      const assistantReply = response ?? '';
      dashboard.setLastExchange(trimmedInput, assistantReply);
      dashboard.setStatus('ready');

      if (!visualizeEvents) {
        console.log(`Assistant: ${assistantReply}`);
      }
    }
  } finally {
    rl.close();
    await runner.close();
  }
}

export async function runOneShotMode(
  task: string,
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  onOperationalEvent: OperationalEventHandler,
  telemetryConfig?: TelemetryConfig,
) {
  const result = await runCopilotTaskWithConfiguredAgents(task, agents, resume, toolNames, telemetryConfig, {
    onOperationalEvent,
  });

  process.stdout.write(`${result ?? ''}\n`);
}
