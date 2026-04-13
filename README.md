# Omni

> 🚀 **Run GitHub Copilot agents from the command line with powerful automation capabilities.**

Omni is a CLI tool that orchestrates configurable Copilot agents for complex tasks—from simple one-shot queries to multi-agent negotiations with full observability.

---

## ✨ Features

- **🤖 Multiple Agent Modes** — One-shot execution, interactive sessions, or multi-agent dialogue
- **🛠️ Custom Tooling** — Extend agents with your own tools via simple JSON configuration
- **📊 Real-time Dashboard** — Live event visualization and conversation tracking in interactive mode
- **📡 OpenTelemetry Support** — Full observability with Jaeger integration for tracing and debugging
- **💾 Session Persistence** — Resume previous sessions with state restoration
- **⚙️ Runtime Configuration** — Flexible config files and CLI overrides

---

## 🚀 Quick Start

### Installation

```bash
pnpm install
```

### Run Your First Task

```bash
# One-shot mode (output to stdout)
pnpm start --agent-file ./config/agent1.json "Explain quantum computing"

# Interactive mode (live dashboard)
pnpm start --agent-file ./config/agent1.json --interactive
```

---

## 📖 Usage Modes

### One-Shot Mode

Execute a single task. Assistant output goes to stdout, operational events to stderr:

```bash
pnpm start --agent-file ./config/agent1.json "Refactor this function to use async/await"

# With custom tools
pnpm start --agent-file ./config/agent1.json --tools-file ./config/tools.json "Analyze codebase"
```

### Interactive Mode

Same-terminal dashboard with separate Events and Conversation panels:

```bash
pnpm start --agent-file ./config/agent1.json --interactive

# Disable event visualization for cleaner output
pnpm start --agent-file ./config/agent1.json --interactive --no-visualize-events
```

> 💡 **Tip:** Type `exit` in interactive mode to quit.

### Dialogue Mode (Multi-Agent Negotiation)

Run structured, turn-by-turn conversations between two agents:

```bash
pnpm start --agent-file ./config/agents.json \
  --dialogue \
  --dialogue-agent1 seller \
  --dialogue-agent2 buyer \
  --max-turns 10 \
  "Negotiate a high-volume gold purchase price."
```

**Dialogue Options:**
| Flag | Description |
|------|-------------|
| `--agreement-token <token>` | Token that stops dialogue when mentioned (default: `AGREEMENT_REACHED`) |
| `--no-stop-on-agreement` | Continue until `--max-turns` even if agreement is reached |

---

## ⚙️ Configuration

### Runtime Configuration File

Create a `runtimeConfig.json` in your project root to set defaults:

```json
{
  "agentFile": "./config/agent1.json",
  "toolsFile": "./config/tools.json",
  "interactive": true,
  "visualizeEvents": true,
  "telemetryOtlpEndpoint": "http://localhost:4318"
}
```

**Config Lookup Order:**
1. Directory containing the CLI executable
2. Current working directory (fallback)

**Override with custom path:**
```bash
pnpm start --config ./config/runtime.local.json "Your task here"
```

**Option Precedence:** CLI flags → Runtime config → Built-in defaults

### Agent & Tool Definitions

- **Agent configs**: JSON files (single object or array) passed via `--agent-file`
- **Tool configs**: JSON files passed via `--tools-file`

See the [`config/`](./config/) directory for examples.

---

## 📊 Telemetry & Observability

Omni exports OpenTelemetry traces for full visibility into agent operations.

### Quick Setup

```bash
# Start Jaeger
podman compose -f docker-compose.jaeger.yml up -d

# Run with telemetry
pnpm start --agent-file ./config/agent1.json \
  --telemetry-otlp-endpoint http://localhost:4318 \
  --telemetry-source-name omni-cli \
  --telemetry-capture-content \
  "Your task here"
```

View traces at: **http://localhost:16686**

### Telemetry Flags

| Flag | Description |
|------|-------------|
| `--telemetry-otlp-endpoint <url>` | OTLP HTTP endpoint for trace export |
| `--telemetry-source-name <name>` | Service name shown in Jaeger |
| `--telemetry-exporter-type <type>` | `otlp-http` or `file` |
| `--telemetry-file-path <path>` | File path when using file exporter |
| `--telemetry-capture-content` | Include message content in traces |

📄 See [`doc/telemetry.md`](./doc/telemetry.md) for detailed setup and troubleshooting.

---

## 🔧 Building & Development

```bash
# Build TypeScript
pnpm build

# Run tests
pnpm test
```

---

## 🏗️ Architecture

| File | Purpose |
|------|---------|
| `src/cli.ts` | Entry point |
| `src/cliCommand.ts` | CLI argument parsing & command setup |
| `src/cliAction.ts` | Runtime mode routing |
| `src/cliWorkflow.ts` | Interactive loop & execution helpers |
| `src/configLoader.ts` | Zod-validated config loading |
| `src/copilot.ts` | Copilot session lifecycle |
| `src/eventMapper.ts` | Event translation layer |
| `src/outputState.ts` | Dashboard state management |
| `src/outputRenderer.ts` | Terminal rendering |
| `src/output.ts` | Dashboard facade |

---

## 🧩 Extending Omni

### Adding Custom Tools

1. Create tool definition in `src/tools/<your-tool>.ts`
2. Register in `src/tools.ts`
3. Reference tool name in your tools config file

> ✅ Schema validation errors include full paths for easier debugging.

### Extending Event Mapping

1. Add translation logic in `src/eventMapper.ts`
2. Align with `OperationalEvent` type in `src/events.ts`
3. Update `src/outputState.ts` if dashboard behavior changes

---

## 📝 Session Management

- **Resume sessions:** `pnpm start --resume <sessionId>`
- **Session data stored at:** `~/.copilot/session-state/<sessionId>/session-activity.json`

---

## 📄 License

[MIT](./LICENSE)
