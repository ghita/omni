import { CliDashboard } from './output';
import {
  loadAgentConfigs,
  loadRuntimeCliConfig,
  loadToolNames,
  resolveDefaultRuntimeConfigPath,
  resolveDialogueConfig,
  RuntimeCliConfig,
} from './configLoader';
import { CliActionOptions, MERGEABLE_OPTION_KEYS } from './cliOptions';
import { buildEventHandler, runDialogueMode, runInteractiveMode, runOneShotMode } from './cliWorkflow';
import { normalizeTelemetryConfig } from './telemetryConfig';

function mergeCliOptionsWithRuntimeConfig(options: CliActionOptions, runtimeConfig: RuntimeCliConfig): CliActionOptions {
  const merged: CliActionOptions = {
    ...runtimeConfig,
    ...(options.config !== undefined ? { config: options.config } : {}),
  };

  for (const key of MERGEABLE_OPTION_KEYS) {
    const value = options[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}

export async function runCliAction(task: string | undefined, options: CliActionOptions) {
  const runtimeConfigPath = options.config ?? resolveDefaultRuntimeConfigPath();
  let runtimeConfig: RuntimeCliConfig = {};
  let mergedOptions: CliActionOptions;
  try {
    runtimeConfig = loadRuntimeCliConfig(runtimeConfigPath, Boolean(options.config));
    mergedOptions = mergeCliOptionsWithRuntimeConfig(options, runtimeConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while reading runtime config';
    console.error(message);
    process.exit(1);
  }

  const agents = loadAgentConfigs(mergedOptions.agentFile);
  if (agents.length === 0) {
    console.error('No agents specified. Use --agent-file.');
    process.exit(1);
  }

  let toolNames: string[] | undefined;
  try {
    toolNames = loadToolNames(mergedOptions.toolsFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while reading tools file';
    console.error(message);
    process.exit(1);
  }

  const interactiveMode = Boolean(mergedOptions.interactive);
  let dialogueConfig;
  try {
    dialogueConfig = resolveDialogueConfig(mergedOptions, agents);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while reading dialogue options';
    console.error(message);
    process.exit(1);
  }
  const visualizeEvents = mergedOptions.visualizeEvents !== false;
  const telemetryConfig = normalizeTelemetryConfig(mergedOptions);
  const dashboard = new CliDashboard({ enabled: interactiveMode && visualizeEvents });
  const onOperationalEvent = buildEventHandler(visualizeEvents, interactiveMode, dashboard);

  if (dialogueConfig) {
    if (interactiveMode) {
      throw new Error('Dialogue mode cannot be used with --interactive.');
    }
    if (mergedOptions.resume) {
      throw new Error('Dialogue mode does not support --resume.');
    }
    if (!task) {
      console.error('Task is required in dialogue mode. Pass a task prompt to seed the negotiation.');
      process.exit(1);
    }
    await runDialogueMode(task, agents, toolNames, dialogueConfig, onOperationalEvent, telemetryConfig);
    return;
  }

  if (interactiveMode) {
    await runInteractiveMode(
      agents,
      mergedOptions.resume,
      toolNames,
      visualizeEvents,
      dashboard,
      onOperationalEvent,
      telemetryConfig,
    );
    return;
  }

  if (!task) {
    console.error('Task is required in one-shot mode. Pass a task or use --interactive.');
    process.exit(1);
  }

  await runOneShotMode(task, agents, mergedOptions.resume, toolNames, onOperationalEvent, telemetryConfig);
}
