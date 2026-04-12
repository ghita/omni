import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomAgentConfig } from '@github/copilot-sdk';
import { DialogueConfig } from './configLoader';
import { DialogueSession } from './dialogueMode';
import { CopilotRunner } from './copilot';
import { OperationalEvent } from './events';

type FakeRunner = CopilotRunner & {
  readonly prompts: string[];
  readonly closedCount: number;
};

function createFakeRunner(replies: string[]): FakeRunner {
  const prompts: string[] = [];
  let index = 0;
  let closedCount = 0;

  return {
    prompts,
    get closedCount() {
      return closedCount;
    },
    sendTask: async (prompt: string) => {
      prompts.push(prompt);
      const reply = replies[index] ?? '';
      index += 1;
      return reply;
    },
    close: async () => {
      closedCount += 1;
    },
  };
}

const baseDialogueConfig: DialogueConfig = {
  enabled: true,
  agent1Name: 'Agent One',
  agent2Name: 'Agent Two',
  maxTurns: 3,
  stopOnAgreement: true,
  agreementToken: 'AGREEMENT_REACHED',
};

const baseAgents: CustomAgentConfig[] = [
  {
    name: 'Agent One',
    prompt: 'You are Agent One, skilled in negotiation.',
  },
  {
    name: 'Agent Two',
    prompt: 'You are Agent Two, a strategic negotiator.',
  },
];

test('DialogueSession alternates speakers, emits events, and includes history in prompts', async () => {
  const runner1 = createFakeRunner(['A1 turn 1 reply', 'A1 turn 3 reply']);
  const runner2 = createFakeRunner(['A2 turn 2 reply']);
  const events: OperationalEvent[] = [];
  const outputs: string[] = [];

  const session = new DialogueSession(
    'Negotiate terms',
    baseDialogueConfig,
    baseAgents,
    [runner1, runner2],
    (event) => events.push(event),
    (text) => outputs.push(text),
  );

  while (!session.isComplete()) {
    await session.executeNextTurn();
  }

  assert.equal(runner1.prompts.length, 2);
  assert.equal(runner2.prompts.length, 1);
  assert.equal(outputs.length, 3);
  assert.match(outputs[0], /^\[Turn 1\] Agent One:/);
  assert.match(outputs[1], /^\[Turn 2\] Agent Two:/);
  assert.match(outputs[2], /^\[Turn 3\] Agent One:/);

  assert.equal(events.length, 6);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      'dialogue.turn.started',
      'dialogue.turn.completed',
      'dialogue.turn.started',
      'dialogue.turn.completed',
      'dialogue.turn.started',
      'dialogue.turn.completed',
    ],
  );

  assert.match(runner2.prompts[0], /\[Turn 1\] Agent One:\nA1 turn 1 reply/);
  assert.match(runner1.prompts[1], /\[Turn 2\] Agent Two:\nA2 turn 2 reply/);
  assert.equal(session.hasEndedByAgreement, false);
});

test('DialogueSession stops early when agreement token is found', async () => {
  const runner1 = createFakeRunner(['Deal accepted\nAGREEMENT_REACHED']);
  const runner2 = createFakeRunner(['should not be used']);
  const events: OperationalEvent[] = [];

  const session = new DialogueSession(
    'Reach agreement',
    { ...baseDialogueConfig, maxTurns: 5 },
    baseAgents,
    [runner1, runner2],
    (event) => events.push(event),
    () => {
      return;
    },
  );

  while (!session.isComplete()) {
    await session.executeNextTurn();
  }

  assert.equal(runner1.prompts.length, 1);
  assert.equal(runner2.prompts.length, 0);
  assert.equal(session.hasEndedByAgreement, true);
  assert.deepEqual(
    events.map((event) => event.type),
    ['dialogue.turn.started', 'dialogue.turn.completed', 'dialogue.agreement'],
  );
});