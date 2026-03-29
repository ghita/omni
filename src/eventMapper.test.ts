import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventMapper } from './eventMapper';

test('maps tool execution start and completion with tool name tracking', () => {
  const map = createEventMapper();

  const started = map({
    type: 'tool.execution_start',
    timestamp: '2026-03-29T10:00:00.000Z',
    data: {
      toolName: 'run_in_terminal',
      toolCallId: 'abc123',
      arguments: { description: 'Run tests' },
    },
  });

  assert.ok(started);
  assert.equal(started?.status, 'running');
  assert.equal(started?.summary, 'run_in_terminal: Run tests');

  const completed = map({
    type: 'tool.execution_complete',
    timestamp: '2026-03-29T10:00:02.000Z',
    data: {
      toolCallId: 'abc123',
      result: { content: 'All tests passed' },
    },
  });

  assert.ok(completed);
  assert.equal(completed?.toolName, 'run_in_terminal');
  assert.equal(completed?.status, 'success');
  assert.match(completed?.summary ?? '', /^run_in_terminal/);
});

test('maps subagent failure with error status and message', () => {
  const map = createEventMapper();

  const failed = map({
    type: 'subagent.failed',
    timestamp: '2026-03-29T10:05:00.000Z',
    data: {
      agentDisplayName: 'Explore',
      agentName: 'Explore',
      error: 'Command failed with exit code 1',
      toolCallId: 'tool-1',
    },
  });

  assert.ok(failed);
  assert.equal(failed?.status, 'error');
  assert.equal(failed?.category, 'subagent');
  assert.equal(failed?.agentDisplayName, 'Explore');
  assert.equal(failed?.toolCallId, 'tool-1');
});
