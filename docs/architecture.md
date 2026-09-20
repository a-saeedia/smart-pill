# Architecture Overview

## MCP Server Architecture

smart-pill is built as a Model Context Protocol (MCP) server using the `@modelcontextprotocol/sdk`. The core architecture consists of:

- **`McpServer`** — The main server instance that registers all tools and handlers.
- **`StdioServerTransport`** — The transport layer that communicates over standard input/output, allowing the server to be used as a local MCP tool by clients like OpenCode.

## Module Map

The `src/` directory contains the following modules:

| Module     | Responsibility                          |
|------------|-----------------------------------------|
| `config`   | Configuration loading and validation    |
| `store`    | Persistent key-value store              |
| `ledger`   | Token usage tracking and accounting     |
| `digest`   | Context digesting and summarization     |
| `search`   | Semantic search over stored memories    |
| `plan`     | Task planning and decomposition         |
| `review`   | Self-review and quality checking        |
| `route`    | Model routing and escalation logic      |
| `escalate` | Escalation to larger models             |
| `tokens`   | Token counting and budget management    |

## Data Flow

The typical data flow for a user request is:

```
User prompt → Tool handler → KV store / Ledger → Response
```

1. A user sends a prompt through the MCP client.
2. The `McpServer` routes the request to the appropriate tool handler.
3. The handler reads/writes to the **KV store** (`store`) and records usage in the **ledger** (`ledger`).
4. The handler may invoke `digest` for context compression or `search` for memory retrieval.
5. The final response is sent back through the `StdioServerTransport`.

## Escalation Path

When a task requires more capability than the current model can provide, the escalation path is triggered:

```
decideEscalation → chatCompletion → fallback
```

1. **`decideEscalation`** evaluates whether the current task exceeds the configured auto-threshold.
2. If escalation is needed, **`chatCompletion`** routes the request to a larger model (e.g., via the Pollinations API).
3. If the larger model also fails or is unavailable, a **fallback** response is returned to the user.

The `force` parameter in `pill_route` allows manual override of the escalation decision, and `pill_context` displays the current auto-threshold status.
