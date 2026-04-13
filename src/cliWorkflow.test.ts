import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalEvent } from './events';
import { CustomAgentConfig, TelemetryConfig } from '@github/copilot-sdk';
import {
  buildEventHandler,
  runOneShotMode,
  runInteractiveMode,
  OperationalEventHandler,
} from './cliWorkflow';



function createFakeDashboard() {
  const addedEvents: OperationalEvent[] = [];
  const linearEvents: OperationalEvent[] = [];
  const statusHistory: string[] = [];

  return {
    addedEvents,
    linearEvents,
    statusHistory,
    addEvent(event: OperationalEvent) {
      addedEvents.push(event);
    },
    printLinearEvent(event: OperationalEvent) {
      linearEvents.push(event);
    },
    setStatus(status: string) {
      statusHistory.push(status);
    },
    clearStreamingContent() {},
    finalizeStreamingContent() {},
    appendStreamingContent(_chunk: string) {},
    setLastExchange(_userPrompt: string, _assistantReply: string) {},
  };
}

// Test data
const sampleEvent: OperationalEvent = {
  type: 'tool.execution_start',
  timestamp: '2026-04-13T10:00:00.000Z',
  status: 'running',
  summary: 'Test tool execution',
  category: 'tool',
};

const baseAgents: CustomAgentConfig[] = [
  { name: 'TestAgent', prompt: 'You are a test agent' },
];

// Fake for runCopilotTaskWithConfiguredAgents
type FakeCopilotResult = {
  task: string;
  agents: CustomAgentConfig[];
  resume: string | undefined;
  toolNames: string[] | undefined;
  telemetry: TelemetryConfig | undefined;
  handlers: { onOperationalEvent?: OperationalEventHandler } | undefined;
};

let lastCopilotCall: FakeCopilotResult | null = null;
let copilotReturnValue: string | undefined = undefined;

async function fakeRunCopilotTaskWithConfiguredAgents(
  task: string,
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  telemetry: TelemetryConfig | undefined,
  handlers: { onOperationalEvent?: OperationalEventHandler } | undefined,
): Promise<string | undefined> {
  lastCopilotCall = { task, agents, resume, toolNames, telemetry, handlers };
  return copilotReturnValue;
}

test('buildEventHandler does nothing when visualizeEvents is false', () => {
  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const handler = buildEventHandler(false, true, dashboard);

  handler(sampleEvent);

  assert.equal(dashboard.addedEvents.length, 0);
  assert.equal(dashboard.linearEvents.length, 0);
});

test('buildEventHandler calls addEvent in interactive mode', () => {
  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const handler = buildEventHandler(true, true, dashboard);

  handler(sampleEvent);

  assert.equal(dashboard.addedEvents.length, 1);
  assert.equal(dashboard.addedEvents[0], sampleEvent);
  assert.equal(dashboard.linearEvents.length, 0);
});

test('buildEventHandler calls printLinearEvent in non-interactive mode', () => {
  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const handler = buildEventHandler(true, false, dashboard);

  handler(sampleEvent);

  assert.equal(dashboard.linearEvents.length, 1);
  assert.equal(dashboard.linearEvents[0], sampleEvent);
  assert.equal(dashboard.addedEvents.length, 0);
});

test('buildEventHandler handles multiple events correctly', () => {
  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const handler = buildEventHandler(true, true, dashboard);

  const event1: OperationalEvent = { ...sampleEvent, summary: 'Event 1' };
  const event2: OperationalEvent = { ...sampleEvent, summary: 'Event 2' };

  handler(event1);
  handler(event2);

  assert.equal(dashboard.addedEvents.length, 2);
  assert.equal(dashboard.addedEvents[0].summary, 'Event 1');
  assert.equal(dashboard.addedEvents[1].summary, 'Event 2');
});

test('buildEventHandler preserves event data correctly', () => {
  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const handler = buildEventHandler(true, true, dashboard);

  const complexEvent: OperationalEvent = {
    type: 'subagent.complete',
    timestamp: '2026-04-13T10:00:00.000Z',
    status: 'success',
    summary: 'Subagent completed successfully',
    category: 'subagent',
    agentDisplayName: 'TestAgent',
    toolCallId: 'call-123',
  };

  handler(complexEvent);

  assert.equal(dashboard.addedEvents.length, 1);
  const storedEvent = dashboard.addedEvents[0];
  assert.equal(storedEvent.type, 'subagent.complete');
  assert.equal(storedEvent.agentDisplayName, 'TestAgent');
  assert.equal(storedEvent.toolCallId, 'call-123');
});

test('runOneShotMode passes correct arguments to injected runTask', async () => {
  const capturedArgs: {
    task?: string;
    agents?: CustomAgentConfig[];
    resume?: string;
    toolNames?: string[];
    telemetry?: TelemetryConfig;
  } = {};

  const fakeRunTask: import('./cliWorkflow').RunCopilotTaskFn = async (
    task,
    agents,
    resume,
    toolNames,
    telemetry,
  ) => {
    capturedArgs.task = task;
    capturedArgs.agents = agents;
    capturedArgs.resume = resume;
    capturedArgs.toolNames = toolNames;
    capturedArgs.telemetry = telemetry;
    return 'fake result';
  };

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const stdoutWrites: string[] = [];
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutWrites.push(chunk.toString());
    return true;
  };

  try {
    const eventHandler = () => {};
    const telemetryConfig: TelemetryConfig = {
      sourceName: 'test-source',
      otlpEndpoint: 'http://localhost:4317',
    };

    await runOneShotMode(
      'Test task',
      baseAgents,
      'resume-session-123',
      ['tool1', 'tool2'],
      eventHandler,
      telemetryConfig,
      fakeRunTask,
    );

    assert.equal(capturedArgs.task, 'Test task');
    assert.deepEqual(capturedArgs.agents, baseAgents);
    assert.equal(capturedArgs.resume, 'resume-session-123');
    assert.deepEqual(capturedArgs.toolNames, ['tool1', 'tool2']);
    assert.equal(capturedArgs.telemetry, telemetryConfig);

    // Verify output was written
    assert.equal(stdoutWrites.length, 1);
    assert.equal(stdoutWrites[0], 'fake result\n');
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test('runOneShotMode passes event handler to runTask', async () => {
  let receivedEventHandler: OperationalEventHandler | undefined;

  const fakeRunTask: import('./cliWorkflow').RunCopilotTaskFn = async (
    _task,
    _agents,
    _resume,
    _toolNames,
    _telemetry,
    handlers,
  ) => {
    receivedEventHandler = handlers?.onOperationalEvent;
    return undefined;
  };

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const stdoutWrites: string[] = [];
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutWrites.push(chunk.toString());
    return true;
  };

  try {
    const myEventHandler: OperationalEventHandler = () => {};
    await runOneShotMode('task', baseAgents, undefined, undefined, myEventHandler, undefined, fakeRunTask);

    assert.equal(receivedEventHandler, myEventHandler);
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test('runOneShotMode handles undefined result from runTask', async () => {
  const fakeRunTask: import('./cliWorkflow').RunCopilotTaskFn = async () => undefined;

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const stdoutWrites: string[] = [];
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutWrites.push(chunk.toString());
    return true;
  };

  try {
    await runOneShotMode('task', baseAgents, undefined, undefined, () => {}, undefined, fakeRunTask);

    // Should write just a newline for undefined result
    assert.equal(stdoutWrites.length, 1);
    assert.equal(stdoutWrites[0], '\n');
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test('runOneShotMode handles empty string result from runTask', async () => {
  const fakeRunTask: import('./cliWorkflow').RunCopilotTaskFn = async () => '';

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const stdoutWrites: string[] = [];
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutWrites.push(chunk.toString());
    return true;
  };

  try {
    await runOneShotMode('task', baseAgents, undefined, undefined, () => {}, undefined, fakeRunTask);

    assert.equal(stdoutWrites.length, 1);
    assert.equal(stdoutWrites[0], '\n');
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

// runInteractiveMode tests
type FakeRunner = {
  sendTaskStreamingCalls: { task: string; chunks: string[] }[];
  closeCalled: boolean;
  replies: string[];
  replyIndex: number;
};

function createFakeRunner(replies: string[]): FakeRunner {
  const sendTaskStreamingCalls: { task: string; chunks: string[] }[] = [];
  let replyIndex = 0;

  return {
    sendTaskStreamingCalls,
    closeCalled: false,
    replies,
    replyIndex,
    sendTaskStreaming: async (task: string, onChunk: (chunk: string) => void) => {
      const reply = replies[replyIndex] ?? '';
      replyIndex += 1;
      sendTaskStreamingCalls.push({ task, chunks: [] });
      if (reply) {
        onChunk(reply);
        sendTaskStreamingCalls[sendTaskStreamingCalls.length - 1].chunks.push(reply);
      }
      return reply;
    },
    close: async () => {
      // Will be handled by the test via tracking
    },
  };
}

test('runInteractiveMode handles single user input and exit', async () => {
  const inputs = ['hello', 'exit'];
  let inputIndex = 0;
  const fakePrompt = async (_question: string) => inputs[inputIndex++];

  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const events: OperationalEvent[] = [];

  const fakeCreateRunner: import('./cliWorkflow').CreateRunnerFn = async () => {
    return createFakeRunner(['Hello response']) as unknown as import('./copilot').CopilotRunner;
  };

  await runInteractiveMode(
    baseAgents,
    undefined,
    undefined,
    true,
    dashboard,
    (event) => events.push(event),
    undefined,
    fakeCreateRunner,
    fakePrompt,
  );

  assert.equal(inputIndex, 2);
});

test('runInteractiveMode skips empty input', async () => {
  const inputs = ['', '   ', 'hello', 'exit'];
  let inputIndex = 0;
  const fakePrompt = async (_question: string) => inputs[inputIndex++];

  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const fakeCreateRunner: import('./cliWorkflow').CreateRunnerFn = async () => {
    return createFakeRunner(['response']) as unknown as import('./copilot').CopilotRunner;
  };

  await runInteractiveMode(
    baseAgents,
    undefined,
    undefined,
    true,
    dashboard,
    () => {},
    undefined,
    fakeCreateRunner,
    fakePrompt,
  );

  // Should have prompted 4 times (2 empty, 1 hello, 1 exit)
  assert.equal(inputIndex, 4);
});

test('runInteractiveMode breaks on exit command (case insensitive)', async () => {
  const inputs = ['EXIT', 'Exit', 'exit'];
  let inputIndex = 0;
  const fakePrompt = async (_question: string) => inputs[inputIndex++];

  const dashboard = createFakeDashboard() as unknown as import('./output').CliDashboard;
  const fakeCreateRunner: import('./cliWorkflow').CreateRunnerFn = async () => {
    return createFakeRunner([]) as unknown as import('./copilot').CopilotRunner;
  };

  await runInteractiveMode(
    baseAgents,
    undefined,
    undefined,
    true,
    dashboard,
    () => {},
    undefined,
    fakeCreateRunner,
    fakePrompt,
  );

  assert.equal(inputIndex, 1);
});
