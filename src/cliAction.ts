import { CliDashboard } from './output';
import { loadAgentConfigs, loadToolNames } from './configLoader';
import { buildEventHandler, runInteractiveMode, runOneShotMode } from './cliWorkflow';

export type CliActionOptions = {
  agentFile?: string;
  toolsFile?: string;
  resume?: string;
  interactive?: boolean;
  visualizeEvents?: boolean;
};

export async function runCliAction(task: string | undefined, options: CliActionOptions) {
  const agents = loadAgentConfigs(options.agentFile);
  if (agents.length === 0) {
    console.error('No agents specified. Use --agent-file.');
    process.exit(1);
  }

  let toolNames: string[] | undefined;
  try {
    toolNames = loadToolNames(options.toolsFile);
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

  await runOneShotMode(task, agents, options.resume, toolNames, onOperationalEvent);
}
