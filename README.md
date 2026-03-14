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

## Creating the standalone Omni repository

A helper script in the parent repository automates extracting this directory — along with its full git history — into a new GitHub repository called `omni`.

**Prerequisites:**
- [`git filter-repo`](https://github.com/newren/git-filter-repo): `pip install git-filter-repo`
- [GitHub CLI (`gh`)](https://cli.github.com/) authenticated via `gh auth login`

**Run from the root of the `copilot-sdk` repository:**

```bash
# Public repository under your personal account
./scripts/create-omni-repo.sh

# Public repository under an organization
./scripts/create-omni-repo.sh --org <your-org>

# Private repository
./scripts/create-omni-repo.sh --private
```

The script will:
1. Create a temporary clone of this repository.
2. Rewrite git history to contain only the `omni/` subtree (mapped to the repo root).
3. Create the new `omni` repository on GitHub.
4. Push the extracted history.
