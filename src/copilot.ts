import { CopilotClient, CustomAgentConfig, TelemetryConfig } from '@github/copilot-sdk';
import { resolveTools } from './tools';
import { SessionActivityLogger } from './sessionLog';
import { createEventMapper, SessionEvent } from './eventMapper';
import { OperationalEvent } from './events';
import { describeTelemetryConfig, normalizedServiceNameFromTelemetry } from './telemetryConfig';

export type { OperationalEvent } from './events';

export type CopilotOutputHandlers = {
    onOperationalEvent?: (event: OperationalEvent) => void;
    onStreamingContent?: (chunk: string) => void;
};

export type TraceContextProvider = () => { traceparent?: string; tracestate?: string };

export type CopilotRunner = {
    sendTask: (task: string) => Promise<string | undefined>;
    sendTaskStreaming: (task: string, onChunk: (chunk: string) => void) => Promise<string | undefined>;
    close: () => Promise<void>;
};

function nowIsoTimestamp() {
    return new Date().toISOString();
}


export async function createCopilotRunnerWithConfiguredAgents(
    agents: CustomAgentConfig[],
    resume: string | undefined,
    toolNames?: string[],
    telemetry?: TelemetryConfig,
    handlers?: CopilotOutputHandlers,
    onGetTraceContext?: TraceContextProvider,
): Promise<CopilotRunner> {
    const serviceName = telemetry ? normalizedServiceNameFromTelemetry(telemetry) : undefined;
    const client = telemetry
        ? new CopilotClient({
            telemetry,
            ...(serviceName ? { env: { ...process.env, OTEL_SERVICE_NAME: serviceName } } : {}),
	        ...(onGetTraceContext ? { onGetTraceContext } : {})
        })
        : new CopilotClient();
    const tools = resolveTools(toolNames);
    const model = 'gpt-4.1';
    const activityLogger = new SessionActivityLogger({ resumeSessionId: resume, model });

    if (telemetry) {
        handlers?.onOperationalEvent?.({
            timestamp: nowIsoTimestamp(),
            type: 'telemetry.configured',
            status: 'info',
            summary: `Telemetry enabled for sourceName: ${telemetry.sourceName}, OtlpEndpoint: ${telemetry.otlpEndpoint}`,
            category: 'session',
            phase: 'info',
            details: describeTelemetryConfig(telemetry),
        });
    }

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
    let streamingCallback: ((chunk: string) => void) | null = null;
    let accumulatedContent = '';

    const unsubscribe = session.on((event) => {
        const sessionEvent = event as SessionEvent;

        // Handle streaming content deltas separately
        if (sessionEvent.type === 'assistant.message_delta') {
            const deltaContent = String(sessionEvent.data?.deltaContent ?? '');
            if (deltaContent) {
                accumulatedContent += deltaContent;
                streamingCallback?.(deltaContent);
            }
            return;
        }

        const mappedEvent = mapEvent(sessionEvent);
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
        sendTaskStreaming: async (task: string, onChunk: (chunk: string) => void) => {
            accumulatedContent = '';
            streamingCallback = onChunk;

            try {
                const response = await session.sendAndWait({ prompt: task });
                // If no streaming events fired, use the response content
                if (accumulatedContent === '') {
                    const content = response?.data.content ?? '';
                    if (content) {
                        onChunk(content);
                    }
                    accumulatedContent = content;
                }
                activityLogger.recordTurn(task, accumulatedContent);
                return accumulatedContent;
            } finally {
                streamingCallback = null;
            }
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
    telemetry?: TelemetryConfig,
    handlers?: CopilotOutputHandlers,
) {
    const runner = await createCopilotRunnerWithConfiguredAgents(agents, resume, toolNames, telemetry, handlers);
    try {
        return await runner.sendTask(task);
    } finally {
        await runner.close();
    }
}
