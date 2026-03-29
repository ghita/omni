# Omni

A CLI tool for running tasks with configurable Copilot agents.

## Installation

```bash
pnpm install
```

## Usage

### One-shot mode

Assistant reply is written to stdout, operational events to stderr:

```bash
pnpm start --agent-file ./config/agent1.json "Tell me a joke"
pnpm start --agent-file ./config/agent1.json --tools-file ./config/tools.json "Tell me a joke"
```

### Interactive mode

Same-terminal dashboard with separate Events and Conversation sections:

```bash
pnpm start --agent-file ./config/agent1.json --interactive
pnpm start --agent-file ./config/agent1.json --tools-file ./config/tools.json --interactive
```

### Disable event visualization

```bash
pnpm start --agent-file ./config/agent1.json --interactive --no-visualize-events
```

## Notes

- Type `exit` in interactive mode to quit.
- In one-shot mode, pass a task argument unless using `--interactive`.
- Use `--resume <sessionId>` to resume a previous session.
- Session activity is persisted to a single JSON file at `~/.copilot/session-state/<sessionId>/session-activity.json`.

## Build

```bash
pnpm build
```

## Configuration

Agent definitions are JSON files (array or single object) passed via `--agent-file`.  
Tool definitions are JSON files passed via `--tools-file`.

See the `config/` directory for examples.

## Architecture

- `src/cli.ts`: thin entrypoint.
- `src/cliCommand.ts`: CLI command/options wiring.
- `src/cliAction.ts`: runtime mode routing (interactive vs one-shot).
- `src/cliWorkflow.ts`: interactive loop + one-shot execution helpers.
- `src/configLoader.ts`: `zod`-validated config loading for agent/tool files.
- `src/copilot.ts`: Copilot session lifecycle orchestration.
- `src/eventMapper.ts`: session event to operational event translation.
- `src/outputState.ts`: dashboard state model and execution tracking.
- `src/outputRenderer.ts`: terminal rendering for dashboard snapshots.
- `src/output.ts`: dashboard facade used by CLI workflows.

## Extending Tools

1. Add a new tool definition in `src/tools/`.
2. Register the tool in `src/tools.ts`.
3. Reference the tool name in a tools config file passed via `--tools-file`.

If the tools file is invalid, the CLI now reports schema validation errors with paths.

## Extending Event Mapping

1. Add event translation logic in `src/eventMapper.ts`.
2. Keep emitted shape aligned with `OperationalEvent` in `src/events.ts`.
3. If dashboard behavior changes, update `src/outputState.ts` and related tests.
