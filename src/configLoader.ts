import * as fs from 'node:fs';
import { z } from 'zod';
import { CustomAgentConfig } from '@github/copilot-sdk';

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
