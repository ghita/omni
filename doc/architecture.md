# CLI Architecture

This document describes the architecture and flow of the Omni CLI.

## Component Overview

The following diagram shows the main components and their relationships.

```mermaid
graph TD
    CLI[src/cli.ts] -->|Loads| Config(config/*.json)
    CLI -->|Initializes| Dashboard[src/output.ts - CliDashboard]
    CLI -->|Calls| CopilotRunner[src/copilot.ts]
    CopilotRunner -->|Resolves Tools| Tools[src/tools.ts]
    CopilotRunner -->|Uses SDK| SDK["@github/copilot-sdk"]
    CopilotRunner -->|Maps Events| EventMapper[src/copilot.ts - EventMapper]
    EventMapper -->|Sends Events| Dashboard
```

## General CLI Flow (Sequence)

The following sequence diagram illustrates the lifecycle of a typical task execution.

```mermaid
sequenceDiagram
    participant U as User
    participant C as CLI (cli.ts)
    participant CP as Copilot (copilot.ts)
    participant T as Tools (tools.ts)
    participant SDK as Copilot SDK
    participant D as Dashboard (output.ts)

    U->>C: Run command (task)
    C->>C: Parse args & load JSON config
    C->>CP: createCopilotRunnerWithConfiguredAgents(config)
    CP->>T: resolveToolNamesToTools(toolNames)
    T-->>CP: Tool references
    CP->>SDK: Initialize CopilotClient & Session
    CP->>SDK: Subscribe to events
    C->>CP: runner.sendTask(task)
    CP->>SDK: session.sendAndWait(task)
    
    loop Event Loop
        SDK->>CP: Session Event (subagent, tool, etc.)
        CP->>CP: Map to OperationalEvent
        CP->>D: addEvent(event)
        D->>U: Update Terminal UI
    end

    SDK-->>CP: Final Result
    CP-->>C: Task Outcome
    C->>U: Display Final Response
```
