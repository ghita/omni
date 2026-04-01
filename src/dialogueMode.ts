import { CustomAgentConfig } from '@github/copilot-sdk';
import { CopilotRunner, createCopilotRunnerWithConfiguredAgents } from './copilot';
import { DialogueConfig } from './configLoader';
import { OperationalEvent } from './events';

export type OperationalEventHandler = (event: OperationalEvent) => void;
type DialogueOutputHandler = (text: string) => void;

type TurnParticipants = {
  speakerName: string;
  listenerName: string;
  speakerRunner: CopilotRunner;
};

function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

function createDialogueStartedEvent(dialogueConfig: DialogueConfig): OperationalEvent {
  return {
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.started',
    status: 'info',
    summary: `Dialogue started: ${dialogueConfig.agent1Name} vs ${dialogueConfig.agent2Name}`,
    category: 'session',
    phase: 'start',
    details: [`maxTurns=${dialogueConfig.maxTurns}`, `stopOnAgreement=${String(dialogueConfig.stopOnAgreement)}`],
  };
}

function createTurnStartedEvent(turn: number, speakerName: string): OperationalEvent {
  return {
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.turn.started',
    status: 'running',
    summary: `Turn ${turn}: ${speakerName}`,
    category: 'session',
    phase: 'start',
  };
}

function createTurnCompletedEvent(turn: number, speakerName: string): OperationalEvent {
  return {
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.turn.completed',
    status: 'success',
    summary: `Turn ${turn} complete: ${speakerName}`,
    category: 'session',
    phase: 'complete',
  };
}

function createAgreementEvent(turn: number, agreementToken: string): OperationalEvent {
  return {
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.agreement',
    status: 'success',
    summary: `Dialogue ended early on agreement at turn ${turn}`,
    category: 'session',
    phase: 'complete',
    details: [`token=${agreementToken}`],
  };
}

function createDialogueCompletedEvent(endedByAgreement: boolean): OperationalEvent {
  return {
    timestamp: nowIsoTimestamp(),
    type: 'dialogue.completed',
    status: 'success',
    summary: endedByAgreement
      ? 'Dialogue completed via agreement.'
      : 'Dialogue completed after reaching max turns.',
    category: 'session',
    phase: 'complete',
  };
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

export class DialogueSession {
  private readonly transcript: string[] = [];
  private currentTurn = 0;
  private endedByAgreement = false;

  constructor(
    private readonly task: string,
    private readonly dialogueConfig: DialogueConfig,
    private readonly runners: readonly [CopilotRunner, CopilotRunner],
    private readonly onOperationalEvent: OperationalEventHandler,
    private readonly onOutput: DialogueOutputHandler,
  ) {}

  get hasEndedByAgreement(): boolean {
    return this.endedByAgreement;
  }

  isComplete(): boolean {
    return this.endedByAgreement || this.currentTurn >= this.dialogueConfig.maxTurns;
  }

  async executeNextTurn(): Promise<void> {
    if (this.isComplete()) {
      return;
    }

    const turn = this.currentTurn + 1;

    const participants = this.selectTurnParticipants(turn);
    const prompt = this.buildTurnPrompt(participants);
    this.emitTurnStarted(turn, participants.speakerName);

    const reply = await this.requestTurnReply(participants.speakerRunner, prompt);
    this.recordTurn(turn, participants.speakerName, reply);
    this.emitTurnCompleted(turn, participants.speakerName);
    this.evaluateAgreementAndMaybeEmit(turn, reply);

    this.currentTurn = turn;
  }

  private selectTurnParticipants(turn: number): TurnParticipants {
    const speakerIsAgent1 = turn % 2 === 1;
    return {
      speakerName: speakerIsAgent1 ? this.dialogueConfig.agent1Name : this.dialogueConfig.agent2Name,
      listenerName: speakerIsAgent1 ? this.dialogueConfig.agent2Name : this.dialogueConfig.agent1Name,
      speakerRunner: speakerIsAgent1 ? this.runners[0] : this.runners[1],
    };
  }

  private buildTurnPrompt(participants: TurnParticipants): string {
    return buildDialoguePrompt(
      participants.speakerName,
      participants.listenerName,
      this.task,
      this.transcript,
      this.dialogueConfig.agreementToken,
    );
  }

  private emitTurnStarted(turn: number, speakerName: string): void {
    this.onOperationalEvent(createTurnStartedEvent(turn, speakerName));
  }

  private async requestTurnReply(speakerRunner: CopilotRunner, prompt: string): Promise<string> {
    return (await speakerRunner.sendTask(prompt)) ?? '';
  }

  private recordTurn(turn: number, speakerName: string, reply: string): void {
    this.transcript.push(`[Turn ${turn}] ${speakerName}:\n${reply}`);
    this.onOutput(`[Turn ${turn}] ${speakerName}: ${reply}\n\n`);
  }

  private emitTurnCompleted(turn: number, speakerName: string): void {
    this.onOperationalEvent(createTurnCompletedEvent(turn, speakerName));
  }

  private evaluateAgreementAndMaybeEmit(turn: number, reply: string): void {
    if (!this.dialogueConfig.stopOnAgreement) {
      return;
    }

    if (!reply.includes(this.dialogueConfig.agreementToken)) {
      return;
    }

    this.endedByAgreement = true;
    this.onOperationalEvent(createAgreementEvent(turn, this.dialogueConfig.agreementToken));
  }
}

async function closeRunnerSafely(runner: CopilotRunner | undefined): Promise<void> {
  if (!runner) {
    return;
  }
  await runner.close();
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

  let runner1: CopilotRunner | undefined;
  let runner2: CopilotRunner | undefined;

  try {
    runner1 = await createCopilotRunnerWithConfiguredAgents([agent1Config], undefined, toolNames, {
      onOperationalEvent,
    });
    runner2 = await createCopilotRunnerWithConfiguredAgents([agent2Config], undefined, toolNames, {
      onOperationalEvent,
    });

    onOperationalEvent(createDialogueStartedEvent(dialogueConfig));

    const session = new DialogueSession(
      task,
      dialogueConfig,
      [runner1, runner2],
      onOperationalEvent,
      (text) => process.stdout.write(text),
    );

    while (!session.isComplete()) {
      await session.executeNextTurn();
    }

    onOperationalEvent(createDialogueCompletedEvent(session.hasEndedByAgreement));
  } finally {
    await closeRunnerSafely(runner2);
    await closeRunnerSafely(runner1);
  }
}