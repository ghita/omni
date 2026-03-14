import { CopilotClient, CustomAgentConfig } from '@github/copilot-sdk';
import { resolveTools } from './tools';

export type OperationalEvent = {
    timestamp: string;
    type: string;
    summary: string;
    details?: string[];
};

export type CopilotOutputHandlers = {
    onOperationalEvent?: (event: OperationalEvent) => void;
};

export type CopilotRunner = {
    sendTask: (task: string) => Promise<string | undefined>;
    close: () => Promise<void>;
};

function nowIsoTimestamp() {
    return new Date().toISOString();
}

function mapSessionEventToOperationalEvent(event: { type: string; data: Record<string, unknown> }): OperationalEvent | undefined {
    switch (event.type) {
        case 'session.start':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: 'Session started',
                details: [`sessionId=${String(event.data.sessionId ?? '')}`],
            };
        case 'subagent.started':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Sub-agent started: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                details: [
                    `description=${String(event.data.agentDescription ?? '')}`,
                    `toolCallId=${String(event.data.toolCallId ?? '')}`,
                ],
            };
        case 'subagent.completed':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Sub-agent completed: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                details: [`toolCallId=${String(event.data.toolCallId ?? '')}`],
            };
        case 'subagent.failed':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Sub-agent failed: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                details: [`error=${String(event.data.error ?? '')}`],
            };
        case 'subagent.selected':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Agent selected: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                details: [`tools=${Array.isArray(event.data.tools) ? event.data.tools.join(', ') : 'all'}`],
            };
        case 'subagent.deselected':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: 'Agent deselected',
            };
        case 'tool.execution_start':
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Tool started: ${String(event.data.toolName ?? 'unknown')}`,
                details: [`arguments=${JSON.stringify(event.data.arguments ?? {})}`],
            };
        case 'tool.execution_complete': {
            const result = event.data.result as { detailedContent?: unknown; content?: unknown } | undefined;
            return {
                timestamp: nowIsoTimestamp(),
                type: event.type,
                summary: `Tool completed: ${String(event.data.toolCallId ?? '')}`,
                details: [`result=${String(result?.detailedContent ?? result?.content ?? '')}`],
            };
        }
        default:
            return undefined;
    }
}

export async function createCopilotRunnerWithConfiguredAgents(
    agents: CustomAgentConfig[],
    resume: string | undefined,
    toolNames?: string[],
    handlers?: CopilotOutputHandlers,
): Promise<CopilotRunner> {
    const client = new CopilotClient();
    const tools = resolveTools(toolNames);
    let session;

    if (resume) {
        handlers?.onOperationalEvent?.({
            timestamp: nowIsoTimestamp(),
            type: 'session.resume',
            summary: 'Resuming session',
            details: [`sessionId=${resume}`],
        });
        session = await client.resumeSession(resume, { onPermissionRequest: async () => ({ kind: 'approved' }) });
    } else {
        session = await client.createSession({
            customAgents: agents,
            ...(tools ? { tools } : {}),
            excludedTools: ['view', 'edit'],
            model: 'gpt-4.1',
            streaming: true,
            onPermissionRequest: async () => ({ kind: 'approved' }),
            hooks: {
                onPostToolUse: (input) => {
                    handlers?.onOperationalEvent?.({
                        timestamp: nowIsoTimestamp(),
                        type: 'hook.onPostToolUse',
                        summary: `Post-tool hook: ${input.toolName}`,
                        details: [`toolResult=${JSON.stringify(input.toolResult)}`],
                    });
                },
            },
        });
    }

    const unsubscribe = session.on((event) => {
        const mappedEvent = mapSessionEventToOperationalEvent(event as { type: string; data: Record<string, unknown> });
        if (mappedEvent) {
            handlers?.onOperationalEvent?.(mappedEvent);
        }
    });

    return {
        sendTask: async (task: string) => {
            const response = await session.sendAndWait({ prompt: task });
            return response?.data.content;
        },
        close: async () => {
            unsubscribe();
            await session.disconnect();
            await client.stop();
        },
    };
}


// Run Copilot task with event and tool notifications
export async function runCopilotTaskWithConfiguredAgents(
    task: string,
    agents: CustomAgentConfig[],
    resume: string | undefined,
    toolNames?: string[],
    handlers?: CopilotOutputHandlers,
) {
    const runner = await createCopilotRunnerWithConfiguredAgents(agents, resume, toolNames, handlers);
    try {
        return await runner.sendTask(task);
    } finally {
        await runner.close();
    }
}
