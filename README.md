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

### Dialogue mode (two-agent negotiation)

Run a structured, turn-by-turn conversation between two configured agents:

```bash
pnpm start --agent-file ./config/agents.json --dialogue --dialogue-agent1 seller --dialogue-agent2 buyer --max-turns 10 "Negotiate a high-volume gold purchase price."
```

Notes:
- Agent 1 speaks first.
- Dialogue stops early if a response includes the agreement token (default: `AGREEMENT_REACHED`).
- Use `--agreement-token <token>` to change the token.
- Use `--no-stop-on-agreement` to always run until `--max-turns`.

### Runtime defaults file

Omni can load CLI defaults from a JSON file named `runtimeConfig.json`.

Lookup order:
- Same directory as the CLI entry script/executable.
- Current working directory (fallback).

You can also point to a specific file:

```bash
pnpm start --config ./config/runtime.local.json "Tell me a joke"
```

Option precedence:
- CLI flags win over runtime config values.
- Runtime config values win over built-in defaults.

Example `runtimeConfig.json`:

```json
{
	"agentFile": "./config/agent1.json",
	"toolsFile": "./config/tools.json",
	"interactive": true,
	"visualizeEvents": true,
	"telemetryOtlpEndpoint": "http://localhost:4318"
}
```

## Notes

- Type `exit` in interactive mode to quit.
- In one-shot mode, pass a task argument unless using `--interactive`.
- In dialogue mode, pass a task argument to seed the negotiation context.
- Use `--resume <sessionId>` to resume a previous session.
- Session activity is persisted to a single JSON file at `~/.copilot/session-state/<sessionId>/session-activity.json`.

## Telemetry (OpenTelemetry + Jaeger)

Start local trace visualization stack:

```bash
podman compose -f docker-compose.jaeger.yml up -d
```

Run Omni with telemetry export enabled:

```bash
pnpm start --agent-file .\config\agent1.json --telemetry-otlp-endpoint http://localhost:4318 --telemetry-source-name omni-cli --telemetry-capture-content "Tell me a joke"
```

View traces in Jaeger at `http://localhost:16686`.
The `--telemetry-source-name` value is also used as OpenTelemetry `service.name`, so Jaeger shows it in the Service dropdown.

CLI telemetry flags:
- `--telemetry-otlp-endpoint <url>`
- `--telemetry-source-name <name>`
- `--telemetry-exporter-type <otlp-http|file>`
- `--telemetry-file-path <path>`
- `--telemetry-capture-content`

See `doc\telemetry.md` for full setup, architecture, troubleshooting, and file-export mode.

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
