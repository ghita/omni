import { CopilotClient, CustomAgentConfig } from '@github/copilot-sdk';
import { resolveTools } from './tools';
import { SessionActivityLogger } from './sessionLog';
import { createEventMapper, SessionEvent } from './eventMapper';
import { OperationalEvent } from './events';

export type { OperationalEvent } from './events';

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
        const mappedEvent = mapEvent(event as SessionEvent);
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
