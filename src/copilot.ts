import { CopilotClient, CustomAgentConfig } from '@github/copilot-sdk';
import { resolveTools } from './tools';
import { SessionActivityLogger } from './sessionLog';

export type OperationalEvent = {
    timestamp: string;
    type: string;
    status?: 'info' | 'success' | 'error' | 'running';
    summary: string;
    details?: string[];
    category?: 'session' | 'subagent' | 'tool';
    phase?: 'start' | 'complete' | 'selected' | 'deselected' | 'info';
    toolCallId?: string;
    toolName?: string;
    agentName?: string;
    agentDisplayName?: string;
    agentDescription?: string;
    error?: string;
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

function stringFrom(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventTimestamp(event: { timestamp?: unknown }): string {
    return stringFrom(event.timestamp) ?? nowIsoTimestamp();
}

function createEventMapper() {
    const toolCallMap = new Map<string, string>();

    return function mapSessionEventToOperationalEvent(event: { type: string; data: Record<string, unknown>; timestamp?: unknown }): OperationalEvent | undefined {
        const timestamp = eventTimestamp(event);
        switch (event.type) {
            case 'session.start':
                return {
                    timestamp,
                    type: event.type,
                    status: 'info',
                    summary: 'Session started',
                    category: 'session',
                    phase: 'start',
                };
            case 'subagent.started':
                return {
                    timestamp,
                    type: event.type,
                    status: 'running',
                    summary: `Agent: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                    category: 'subagent',
                    phase: 'start',
                    toolCallId: stringFrom(event.data.toolCallId),
                    agentName: stringFrom(event.data.agentName),
                    agentDisplayName: stringFrom(event.data.agentDisplayName),
                    agentDescription: stringFrom(event.data.agentDescription),
                };
            case 'subagent.completed':
                return {
                    timestamp,
                    type: event.type,
                    status: 'success',
                    summary: `Agent done: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                    category: 'subagent',
                    phase: 'complete',
                    toolCallId: stringFrom(event.data.toolCallId),
                    agentName: stringFrom(event.data.agentName),
                    agentDisplayName: stringFrom(event.data.agentDisplayName),
                };
            case 'subagent.failed':
                return {
                    timestamp,
                    type: event.type,
                    status: 'error',
                    summary: `Agent failed: ${String(event.data.agentDisplayName ?? 'unknown')} — ${truncate(String(event.data.error ?? ''), 60)}`,
                    category: 'subagent',
                    phase: 'complete',
                    toolCallId: stringFrom(event.data.toolCallId),
                    agentName: stringFrom(event.data.agentName),
                    agentDisplayName: stringFrom(event.data.agentDisplayName),
                    error: stringFrom(event.data.error),
                };
            case 'subagent.selected':
                return {
                    timestamp,
                    type: event.type,
                    status: 'info',
                    summary: `Selected: ${String(event.data.agentDisplayName ?? 'unknown')}`,
                    category: 'subagent',
                    phase: 'selected',
                    agentName: stringFrom(event.data.agentName),
                    agentDisplayName: stringFrom(event.data.agentDisplayName),
                };
            case 'subagent.deselected':
                return {
                    timestamp,
                    type: event.type,
                    status: 'info',
                    summary: 'Agent deselected',
                    category: 'subagent',
                    phase: 'deselected',
                };
            case 'tool.execution_start': {
                const toolName = String(event.data.toolName ?? 'unknown');
                const callId = stringFrom(event.data.toolCallId) ?? '';
                if (callId) toolCallMap.set(callId, toolName);
                const args = event.data.arguments as Record<string, unknown> | undefined;
                const description = typeof args?.description === 'string' ? args.description : undefined;
                const command = typeof args?.command === 'string' ? args.command : undefined;
                const label = description ?? (command ? truncate(command, 60) : undefined) ?? toolName;
                return {
                    timestamp,
                    type: event.type,
                    status: 'running',
                    summary: `${toolName}: ${label}`,
                    category: 'tool',
                    phase: 'start',
                    toolCallId: callId || undefined,
                    toolName,
                };
            }
            case 'tool.execution_complete': {
                const callId = stringFrom(event.data.toolCallId) ?? '';
                const toolName = toolCallMap.get(callId) ?? String(event.data.toolName ?? 'tool');
                if (callId) toolCallMap.delete(callId);
                const result = event.data.result as { detailedContent?: unknown; content?: unknown } | undefined;
                const raw = String(result?.detailedContent ?? result?.content ?? '');
                const firstLine = raw.split('\n').find(l => l.trim()) ?? '';
                const hasError = /error|fail|exception/i.test(raw) && !/exit code 0/i.test(raw);
                return {
                    timestamp,
                    type: event.type,
                    status: hasError ? 'error' : 'success',
                    summary: firstLine
                        ? `${toolName} → ${truncate(firstLine, 60)}`
                        : `${toolName} completed`,
                    category: 'tool',
                    phase: 'complete',
                    toolCallId: callId || undefined,
                    toolName,
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
    const model = 'gpt-4.1';
    const activityLogger = new SessionActivityLogger({ resumeSessionId: resume, model });

    if (toolNames && toolNames.length > 0) {
        handlers?.onOperationalEvent?.({
            timestamp: nowIsoTimestamp(),
            type: 'tools.loaded',
            status: 'success',
            summary: `Loaded tools: ${toolNames.join(', ')}`,
        });
    }

    let session;

    if (resume) {
        handlers?.onOperationalEvent?.({
            timestamp: nowIsoTimestamp(),
            type: 'session.resume',
            status: 'info',
            summary: `Resuming session: ${resume}`,
            category: 'session',
            phase: 'info',
        });
        session = await client.resumeSession(resume, { onPermissionRequest: async () => ({ kind: 'approved' }) });
    } else {
        session = await client.createSession({
            customAgents: agents,
            ...(tools ? { tools } : {}),
            excludedTools: ['view', 'edit'],
            model,
            streaming: true,
            onPermissionRequest: async () => ({ kind: 'approved' }),
        });
    }

    const logPathEvent: OperationalEvent = {
        timestamp: nowIsoTimestamp(),
        type: 'session.log',
        status: 'info',
        summary: `Session activity log: ${activityLogger.getFilePath()}`,
        category: 'session',
        phase: 'info',
        details: ['A single JSON document is written when the runner closes.'],
    };
    handlers?.onOperationalEvent?.(logPathEvent);
    activityLogger.recordEvent(logPathEvent);

    const mapEvent = createEventMapper();
    const unsubscribe = session.on((event) => {
        const mappedEvent = mapEvent(event as { type: string; data: Record<string, unknown>; timestamp?: unknown });
        if (mappedEvent) {
            handlers?.onOperationalEvent?.(mappedEvent);
            activityLogger.recordEvent(mappedEvent);
        }
    });

    return {
        sendTask: async (task: string) => {
            const response = await session.sendAndWait({ prompt: task });
            const assistantReply = response?.data.content ?? '';
            activityLogger.recordTurn(task, assistantReply);
            return response?.data.content;
        },
        close: async () => {
            unsubscribe();
            try {
                await session.disconnect();
            } finally {
                try {
                    await client.stop();
                } finally {
                    await activityLogger.flush();
                }
            }
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
