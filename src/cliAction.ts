import { CliDashboard } from './output';
import { loadAgentConfigs, loadToolNames, resolveDialogueConfig } from './configLoader';
import { buildEventHandler, runDialogueMode, runInteractiveMode, runOneShotMode } from './cliWorkflow';

export type CliActionOptions = {
  agentFile?: string;
  toolsFile?: string;
  resume?: string;
  interactive?: boolean;
  visualizeEvents?: boolean;
  dialogue?: boolean;
  dialogueAgent1?: string;
  dialogueAgent2?: string;
  maxTurns?: number | string;
  stopOnAgreement?: boolean;
  agreementToken?: string;
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
  let dialogueConfig;
  try {
    dialogueConfig = resolveDialogueConfig(options, agents);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while reading dialogue options';
    console.error(message);
    process.exit(1);
  }
  const visualizeEvents = options.visualizeEvents !== false;
  const dashboard = new CliDashboard({ enabled: interactiveMode && visualizeEvents });
  const onOperationalEvent = buildEventHandler(visualizeEvents, interactiveMode, dashboard);

  if (dialogueConfig) {
    if (interactiveMode) {
      throw new Error('Dialogue mode cannot be used with --interactive.');
    }
    if (options.resume) {
      throw new Error('Dialogue mode does not support --resume.');
    }
    if (!task) {
      console.error('Task is required in dialogue mode. Pass a task prompt to seed the negotiation.');
      process.exit(1);
    }
    await runDialogueMode(task, agents, toolNames, dialogueConfig, onOperationalEvent);
    return;
  }

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
