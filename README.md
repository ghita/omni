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

## Build

```bash
pnpm build
```

## Configuration

Agent definitions are JSON files (array or single object) passed via `--agent-file`.  
Tool definitions are JSON files passed via `--tools-file`.

See the `config/` directory for examples.
