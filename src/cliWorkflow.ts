import { createCopilotRunnerWithConfiguredAgents, runCopilotTaskWithConfiguredAgents } from './copilot';
import { CliDashboard } from './output';
import { OperationalEvent } from './events';
import { CustomAgentConfig } from '@github/copilot-sdk';
import * as readline from 'node:readline';
import { DialogueConfig } from './configLoader';

export type OperationalEventHandler = (event: OperationalEvent) => void;

function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

export function buildEventHandler(
  visualizeEvents: boolean,
  interactiveMode: boolean,
  dashboard: CliDashboard,
): OperationalEventHandler {
  return (event: OperationalEvent) => {
    if (!visualizeEvents) {
      return;
    }

    if (interactiveMode) {
      dashboard.addEvent(event);
      return;
    }

    dashboard.printLinearEvent(event);
  };
}

export async function runInteractiveMode(
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  visualizeEvents: boolean,
  dashboard: CliDashboard,
  onOperationalEvent: OperationalEventHandler,
) {
  const runner = await createCopilotRunnerWithConfiguredAgents(agents, resume, toolNames, {
    onOperationalEvent,
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  dashboard.setStatus('ready');
  if (!visualizeEvents) {
    console.log('Interactive mode started. Type "exit" to quit.');
  }

  try {
    while (true) {
      const input = await prompt('You: ');
      const trimmedInput = input.trim();
      if (!trimmedInput) {
        continue;
      }
      if (trimmedInput.toLowerCase() === 'exit') {
        break;
      }

      dashboard.setStatus('waiting for assistant');
      const response = await runner.sendTask(trimmedInput);
      const assistantReply = response ?? '';
      dashboard.setLastExchange(trimmedInput, assistantReply);
      dashboard.setStatus('ready');

      if (!visualizeEvents) {
        console.log(`Assistant: ${assistantReply}`);
      }
    }
  } finally {
    rl.close();
    await runner.close();
  }
}

export async function runOneShotMode(
  task: string,
  agents: CustomAgentConfig[],
  resume: string | undefined,
  toolNames: string[] | undefined,
  onOperationalEvent: OperationalEventHandler,
) {
  const result = await runCopilotTaskWithConfiguredAgents(task, agents, resume, toolNames, {
    onOperationalEvent,
  });

  process.stdout.write(`${result ?? ''}\n`);
}

function buildDialoguePrompt(
  speakerName: string,
  listenerName: string,
  initialTask: string,
  transcript: string[],
  agreementToken: string,
): string {
  const history = transcript.length > 0 ? transcript.join('\n\n') : '(no previous turns)';
  return [
    `You are ${speakerName}.`,
    `You are negotiating with ${listenerName}.`,
    `Initial objective: ${initialTask}`,
    '',
    'Conversation so far:',
    history,
    '',
    'Respond with your next negotiation message only.',
    `If agreement is reached, include the exact token "${agreementToken}" on its own line at the end.`,
  ].join('\n');
}

export async function runDialogueMode(
  task: string,
  agents: CustomAgentConfig[],
  toolNames: string[] | undefined,
  dialogueConfig: DialogueConfig,
  onOperationalEvent: OperationalEventHandler,
) {
  const agent1Config = agents.find((agent) => agent.name === dialogueConfig.agent1Name);
  const agent2Config = agents.find((agent) => agent.name === dialogueConfig.agent2Name);
  if (!agent1Config || !agent2Config) {
    throw new Error('Dialogue participants were not found in loaded agent config.');
  }

  const runner1 = await createCopilotRunnerWithConfiguredAgents([agent1Config], undefined, toolNames, {
    onOperationalEvent,
  });
  const runner2 = await createCopilotRunnerWithConfiguredAgents([agent2Config], undefined, toolNames, {
    onOperationalEvent,
  });

  const transcript: string[] = [];
  let endedByAgreement = false;

  onOperationalEvent({
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.started',
    status: 'info',
    summary: `Dialogue started: ${dialogueConfig.agent1Name} vs ${dialogueConfig.agent2Name}`,
    category: 'session',
    phase: 'start',
    details: [`maxTurns=${dialogueConfig.maxTurns}`, `stopOnAgreement=${String(dialogueConfig.stopOnAgreement)}`],
  });

  try {
    for (let turn = 1; turn <= dialogueConfig.maxTurns; turn += 1) {
      const speakerIsAgent1 = turn % 2 === 1;
      const speakerName = speakerIsAgent1 ? dialogueConfig.agent1Name : dialogueConfig.agent2Name;
      const listenerName = speakerIsAgent1 ? dialogueConfig.agent2Name : dialogueConfig.agent1Name;
      const speakerRunner = speakerIsAgent1 ? runner1 : runner2;
      const prompt = buildDialoguePrompt(
        speakerName,
        listenerName,
        task,
        transcript,
        dialogueConfig.agreementToken,
      );

      onOperationalEvent({
        timestamp: nowIsoTimestamp(),
        type: 'dialogue.turn.started',
        status: 'running',
        summary: `Turn ${turn}: ${speakerName}`,
        category: 'session',
        phase: 'start',
      });

      const reply = (await speakerRunner.sendTask(prompt)) ?? '';
      transcript.push(`[Turn ${turn}] ${speakerName}:\n${reply}`);
      process.stdout.write(`[Turn ${turn}] ${speakerName}: ${reply}\n\n`);

      onOperationalEvent({
        timestamp: nowIsoTimestamp(),
        type: 'dialogue.turn.completed',
        status: 'success',
        summary: `Turn ${turn} complete: ${speakerName}`,
        category: 'session',
        phase: 'complete',
      });

      if (dialogueConfig.stopOnAgreement && reply.includes(dialogueConfig.agreementToken)) {
        endedByAgreement = true;
        onOperationalEvent({
          timestamp: nowIsoTimestamp(),
          type: 'dialogue.agreement',
          status: 'success',
          summary: `Dialogue ended early on agreement at turn ${turn}`,
          category: 'session',
          phase: 'complete',
          details: [`token=${dialogueConfig.agreementToken}`],
        });
        break;
      }
    }
  } finally {
    await runner1.close();
    await runner2.close();
  }

  onOperationalEvent({
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.completed',
    status: 'success',
    summary: endedByAgreement
      ? 'Dialogue completed via agreement.'
      : 'Dialogue completed after reaching max turns.',
    category: 'session',
    phase: 'complete',
  });
}
