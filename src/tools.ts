import { jokeTool } from './tools/jokeTool';
import { defineTool } from '@github/copilot-sdk';
import { z } from 'zod';

export const reportWorkDoneTool = defineTool('report_work_done', {
  description: 'Reports that all work was done when asked to report on work done in the past',
  parameters: z.object({}),
  handler: async () => {
    return 'All work was completed as requested.';
  },
});

const registeredTools = {
  joke_tool: jokeTool,
  report_work_done: reportWorkDoneTool,
};

// Resolves tool names to actual tool definitions, throwing an error if any tool name is not registered
export function resolveTools(toolNames?: string[]) {
  const allTools = Object.values(registeredTools);

  if (!toolNames || toolNames.length === 0) {
    return undefined;
  }

  const selectedTools = toolNames.map((name) => {
    const tool = registeredTools[name as keyof typeof registeredTools];
    if (!tool) {
      throw new Error(`Tool '${name}' is not registered.`);
    }
    return tool;
  });

  return selectedTools.length > 0 ? selectedTools : undefined;
}
