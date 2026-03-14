import { CopilotClient, CustomAgentConfig } from '@github/copilot-sdk';
import { resolveTools } from './tools';

export type OperationalEvent = {
    timestamp: string;
    type: string;
    status?: 'info' | 'success' | 'error' | 'running';
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

function truncate(s: string, maxLen: number): string {
    return s.length > maxLen ? `${s.substring(0, maxLen)}…` : s;
}

function createEventMapper() {
    const toolCallMap = new Map<string, string>();

    return function mapSessionEventToOperationalEvent(event: { type: string; data: Record<string, unknown> }): OperationalEvent | undefined {
        switch (event.type) {
            case 'session.start':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'info',
                    summary: 'Session started',
                };
            case 'subagent.started':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'running',
                    summary: `Agent: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                };
            case 'subagent.completed':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'success',
                    summary: `Agent done: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                };
            case 'subagent.failed':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'error',
                    summary: `Agent failed: ${String(event.data.agentDisplayName ?? 'unknown')} — ${truncate(String(event.data.error ?? ''), 60)}`,
                };
            case 'subagent.selected':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'info',
                    summary: `Selected: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                };
            case 'subagent.deselected':
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'info',
                    summary: 'Agent deselected',
                };
            case 'tool.execution_start': {
                const toolName = String(event.data.toolName ?? 'unknown');
                const callId = String(event.data.toolCallId ?? '');
                if (callId) toolCallMap.set(callId, toolName);
                const args = event.data.arguments as Record<string, unknown> | undefined;
                const description = typeof args?.description === 'string' ? args.description : undefined;
                const command = typeof args?.command === 'string' ? args.command : undefined;
                const label = description ?? (command ? truncate(command, 60) : undefined) ?? toolName;
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: 'running',
                    summary: `${toolName}: ${label}`,
                };
            }
            case 'tool.execution_complete': {
                const callId = String(event.data.toolCallId ?? '');
                const toolName = toolCallMap.get(callId) ?? String(event.data.toolName ?? 'tool');
                if (callId) toolCallMap.delete(callId);
                const result = event.data.result as { detailedContent?: unknown; content?: unknown } | undefined;
                const raw = String(result?.detailedContent ?? result?.content ?? '');
                const firstLine = raw.split('\n').find(l => l.trim()) ?? '';
                const hasError = /error|fail|exception/i.test(raw) && !/exit code 0/i.test(raw);
                return {
                    timestamp: nowIsoTimestamp(),
                    type: event.type,
                    status: hasError ? 'error' : 'success',
                    summary: firstLine
                        ? `${toolName} → ${truncate(firstLine, 60)}`
                        : `${toolName} completed`,
                };
            }
            default:
                return undefined;
        }
    };
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
            status: 'info',
            summary: `Resuming session: ${resume}`,
        });
        session = await client.resumeSession(resume, { onPermissionRequest: async () => ({ kind: 'approved' }) });
    } else {
        session = await client.createSession({
            customAgents: agents,
            //...(tools ? { tools } : {}),
            excludedTools: ['view', 'edit'],
            model: 'gpt-4.1',
            streaming: true,
            onPermissionRequest: async () => ({ kind: 'approved' }),
        });
    }

    const mapEvent = createEventMapper();
    const unsubscribe = session.on((event) => {
        const mappedEvent = mapEvent(event as { type: string; data: Record<string, unknown> });
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
