import { Command } from 'commander';
import { runCliAction } from './cliAction';

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name('copilot-agents')
    .description('CLI for running tasks with configurable Copilot agents')
    .option('-f, --agent-file <file>', 'Path to JSON file with agent definitions (array or object)')
    .option('-t, --tools-file <file>', 'Path to JSON file with tool definitions')
    .option('-r, --resume <sessionId>', 'Resume a previous session')
    .option('-i, --interactive', 'Run in interactive chat mode')
    .option('--no-visualize-events', 'Disable operational event visualization output')
    .option('--dialogue', 'Run turn-by-turn dialogue mode between two configured agents')
    .option('--dialogue-agent1 <agentName>', 'Name of the first agent in dialogue mode')
    .option('--dialogue-agent2 <agentName>', 'Name of the second agent in dialogue mode')
    .option('--max-turns <count>', 'Maximum turns in dialogue mode (default: 10)')
    .option('--no-stop-on-agreement', 'Do not stop dialogue early when agreement token appears')
    .option('--agreement-token <token>', 'Token that signals agreement (default: AGREEMENT_REACHED)')
    .argument('[task]', 'Task prompt to resolve in one-shot mode')
    .action(async (task, options) => {
      await runCliAction(task, options);
    });

  return program;
}
