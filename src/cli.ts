import { Command } from 'commander';
import { CustomAgentConfig } from '@github/copilot-sdk';
import {
  createCopilotRunnerWithConfiguredAgents,
  OperationalEvent,
  runCopilotTaskWithConfiguredAgents,
} from './copilot';
import { CliDashboard } from './output';
import * as fs from 'fs';
import * as readline from 'node:readline';

// Parses the tools file which can be either an array of tool names or an object with a "tools" array. Returns an array of tool names or undefined if no file is provided.
function parseToolsFile(toolsFilePath?: string): string[] | undefined {
  if (!toolsFilePath) {
    return undefined;
  }

  const fileContent = fs.readFileSync(toolsFilePath, 'utf-8');
  const parsed = JSON.parse(fileContent);

  if (Array.isArray(parsed)) {
    return parsed.map((item) => (typeof item === 'string' ? item : item.name));
  }

  if (Array.isArray(parsed.tools)) {
    return parsed.tools.map((item: unknown) =>
      typeof item === 'string' ? item : (item as { name: string }).name
    );
  }

  throw new Error('Invalid tools file format. Expected an array or an object with a tools array.');
}

const program = new Command();

// Builds an operational event handler that either visualizes events in a dashboard or prints them linearly to stderr 
// based on the provided options.
// In interactive mode with visualization enabled, events are added to the dashboard. 
// In non-interactive mode or when visualization is disabled, events are printed linearly to stderr.
function buildEventHandler(
  visualizeEvents: boolean,
  interactiveMode: boolean,
  dashboard: CliDashboard,
) {
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


async function runInteractiveMode(agents: CustomAgentConfig[], resume: string | undefined, toolNames: string[] | undefined, visualizeEvents: boolean, dashboard: CliDashboard, onOperationalEvent: (event: OperationalEvent) => void) {
  const runner = await createCopilotRunnerWithConfiguredAgents(agents, resume, toolNames, {
    onOperationalEvent,
  });

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

program
  .name('copilot-agents')
  .description('CLI for running tasks with configurable Copilot agents')
  .option('-f, --agent-file <file>', 'Path to JSON file with agent definitions (array or object)')
  .option('-t, --tools-file <file>', 'Path to JSON file with tool definitions')
  .option('-r, --resume <sessionId>', 'Resume a previous session')
  .option('-i, --interactive', 'Run in interactive chat mode')
  .option('--no-visualize-events', 'Disable operational event visualization output')
  .argument('[task]', 'Task prompt to resolve in one-shot mode')
  .action(async (task, options) => {
    let agents: CustomAgentConfig[] = [];
    if (options.agentFile) {
      const fileContent = fs.readFileSync(options.agentFile, 'utf-8');
      const parsed = JSON.parse(fileContent);
      agents = Array.isArray(parsed) ? parsed : [parsed];
    }
    if (agents.length === 0) {
      console.error('No agents specified. Use --agent or --agent-file.');
      process.exit(1);
    }

    let toolNames: string[] | undefined;
    try {
      toolNames = parseToolsFile(options.toolsFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error while reading tools file';
      console.error(message);
      process.exit(1);
    }

    const interactiveMode = Boolean(options.interactive);
    const visualizeEvents = options.visualizeEvents !== false;
    const dashboard = new CliDashboard({ enabled: interactiveMode && visualizeEvents });
    const onOperationalEvent = buildEventHandler(visualizeEvents, interactiveMode, dashboard);

    if (interactiveMode) {
      await runInteractiveMode(agents, options.resume, toolNames, visualizeEvents, dashboard, onOperationalEvent);
      return;
    }

    if (!task) {
      console.error('Task is required in one-shot mode. Pass a task or use --interactive.');
      process.exit(1);
    }

    const result = await runCopilotTaskWithConfiguredAgents(task, agents, options.resume, toolNames, {
      onOperationalEvent,
    });
    process.stdout.write(`${result ?? ''}\n`);
  });

program.parseAsync(process.argv);
