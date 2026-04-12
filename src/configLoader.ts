import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { CustomAgentConfig } from '@github/copilot-sdk';
import { CliActionOptions, RuntimeCliConfig, RuntimeCliConfigSchema } from './cliOptions';

const ToolEntrySchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1) }),
]);

const ToolsFileSchema = z.union([
  z.array(ToolEntrySchema),
  z.object({ tools: z.array(ToolEntrySchema) }),
]);

const AgentConfigSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  tools: z.array(z.string().min(1)).optional(),
}).passthrough();

const AgentFileSchema = z.union([
  AgentConfigSchema,
  z.array(AgentConfigSchema),
]);

const DialogueOptionsSchema = z.object({
  dialogue: z.boolean().optional().default(false),
  dialogueAgent1: z.string().min(1).optional(),
  dialogueAgent2: z.string().min(1).optional(),
  maxTurns: z.coerce.number().int().min(1).max(200).optional().default(10),
  stopOnAgreement: z.boolean().optional().default(true),
  agreementToken: z.string().min(1).optional().default('AGREEMENT_REACHED'),
});

const DEFAULT_RUNTIME_CONFIG_FILE = 'runtimeConfig.json';

export type DialogueConfig = {
  enabled: true;
  agent1Name: string;
  agent2Name: string;
  maxTurns: number;
  stopOnAgreement: boolean;
  agreementToken: string;
};

export type { RuntimeCliConfig };

function readJsonFile(filePath: string): unknown {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(fileContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

function formatZodError(prefix: string, error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `${where}: ${issue.message}`;
    })
    .join('; ');
  return `${prefix}: ${details}`;
}

export function loadAgentConfigs(agentFilePath?: string): CustomAgentConfig[] {
  if (!agentFilePath) {
    return [];
  }

  const parsed = AgentFileSchema.safeParse(readJsonFile(agentFilePath));
  if (!parsed.success) {
    throw new Error(formatZodError(`Invalid agent file format in ${agentFilePath}`, parsed.error));
  }

  const value = parsed.data;
  return (Array.isArray(value) ? value : [value]) as CustomAgentConfig[];
}

export function loadToolNames(toolsFilePath?: string): string[] | undefined {
  if (!toolsFilePath) {
    return undefined;
  }

  const parsed = ToolsFileSchema.safeParse(readJsonFile(toolsFilePath));
  if (!parsed.success) {
    throw new Error(formatZodError(`Invalid tools file format in ${toolsFilePath}`, parsed.error));
  }

  const value = parsed.data;
  const entries = Array.isArray(value) ? value : value.tools;
  return entries.map((item) => (typeof item === 'string' ? item : item.name));
}

export function resolveDefaultRuntimeConfigPath(
  entryScriptPath = process.argv[1],
  cwd = process.cwd(),
): string | undefined {
  const searchDirs = [
    entryScriptPath ? path.dirname(path.resolve(entryScriptPath)) : undefined,
    path.resolve(cwd),
  ].filter((value): value is string => Boolean(value));

  const seenDirs = new Set<string>();
  for (const dir of searchDirs) {
    if (seenDirs.has(dir)) {
      continue;
    }
    seenDirs.add(dir);

    const candidate = path.join(dir, DEFAULT_RUNTIME_CONFIG_FILE);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
}

export function loadRuntimeCliConfig(filePath?: string, required = false): RuntimeCliConfig {
  if (!filePath) {
    return {};
  }

  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new Error(`Runtime config file not found: ${filePath}`);
    }
    return {};
  }

  const parsed = RuntimeCliConfigSchema.safeParse(readJsonFile(filePath));
  if (!parsed.success) {
    throw new Error(formatZodError(`Invalid runtime config format in ${filePath}`, parsed.error));
  }

  return parsed.data;
}

type DialogueOptionsInput = Pick<
  CliActionOptions,
  'dialogue' | 'dialogueAgent1' | 'dialogueAgent2' | 'maxTurns' | 'stopOnAgreement' | 'agreementToken'
>;

export function resolveDialogueConfig(
  options: DialogueOptionsInput,
  agents: CustomAgentConfig[],
): DialogueConfig | undefined {
  const parsed = DialogueOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new Error(formatZodError('Invalid dialogue options', parsed.error));
  }

  if (!parsed.data.dialogue) {
    return undefined;
  }

  const { dialogueAgent1, dialogueAgent2, maxTurns, stopOnAgreement, agreementToken } = parsed.data;
  if (!dialogueAgent1 || !dialogueAgent2) {
    throw new Error('Dialogue mode requires --dialogue-agent1 and --dialogue-agent2.');
  }
  if (dialogueAgent1 === dialogueAgent2) {
    throw new Error('Dialogue mode requires two distinct agents.');
  }

  const knownAgents = new Set(agents.map((agent) => agent.name));
  if (!knownAgents.has(dialogueAgent1) || !knownAgents.has(dialogueAgent2)) {
    const available = agents.map((agent) => agent.name).join(', ');
    throw new Error(`Unknown dialogue agent name. Available agents: ${available}`);
  }

  return {
    enabled: true,
    agent1Name: dialogueAgent1,
    agent2Name: dialogueAgent2,
    maxTurns,
    stopOnAgreement,
    agreementToken,
  };
}
