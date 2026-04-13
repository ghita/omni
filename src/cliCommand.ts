import { Command } from 'commander';
import { runCliAction } from './cliAction';

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name('copilot-agents')
    .description('CLI for running tasks with configurable Copilot agents')
    .option('-c, --config <file>', 'Path to runtime JSON config for CLI defaults')
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
    .option('--telemetry-otlp-endpoint <url>', 'Enable OpenTelemetry export to an OTLP HTTP endpoint')
    .option('--telemetry-source-name <name>', 'Set OpenTelemetry instrumentation source name')
    .option('--telemetry-exporter-type <type>', 'Telemetry exporter type (otlp-http or file)')
    .option('--telemetry-file-path <path>', 'Enable telemetry file exporter by writing JSON lines to a file')
    .option('--telemetry-capture-content', 'Capture prompt/response content in telemetry spans')
    .argument('[task]', 'Task prompt to resolve in one-shot mode')
    .action(async (task, options, command) => {
      // Fix Commander's --no- option behavior: 
      // When --no-visualize-events is passed, Commander sets options.visualizeEvents = false
      // When NOT passed, Commander sets options.visualizeEvents = true (the default)
      // This means runtime config can never have visualizeEvents: false because CLI always sets it to true
      // Solution: set CLI value to undefined when not explicitly passed
      const rawArgs = process.argv.slice(2);
      
      if (!rawArgs.includes('--no-visualize-events')) {
        // Not explicitly set, let runtime config decide
        delete (options as Record<string, unknown>).visualizeEvents;
      }
      
      if (!rawArgs.includes('--no-stop-on-agreement')) {
        delete (options as Record<string, unknown>).stopOnAgreement;
      }
      
      await runCliAction(task, options);
    });

  return program;
}
