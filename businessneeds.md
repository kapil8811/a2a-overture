# A2A Overture — Business Needs & Rationale

## The Problem: AI Agents Can't Talk to Each Other

Enterprise AI adoption is accelerating, but most AI agents today operate in silos. Each vendor, framework, and platform uses proprietary APIs, custom protocols, and closed ecosystems. When organizations try to orchestrate multiple agents — from different teams, vendors, or clouds — they hit a wall:

- **No common protocol** — Every agent speaks a different language
- **No interoperability testing** — No way to verify that two agents can actually communicate
- **No compliance standard** — No baseline to certify that an agent follows any shared specification
- **High integration cost** — Every agent-to-agent connection requires custom glue code
- **Vendor lock-in** — Switching or adding agents means rewriting integrations

This fragmentation slows adoption, increases risk, and prevents the kind of multi-agent collaboration that enterprises need to unlock real value from AI.

## The Solution: A2A Protocol (Agent-to-Agent)

The **A2A (Agent-to-Agent) protocol** is an open standard developed under the **Linux Foundation** that defines how AI agents discover, communicate, and collaborate with each other — regardless of vendor, framework, or deployment model.

### Key Concepts

| Concept | Description |
|---|---|
| **Agent Card** | A machine-readable manifest (JSON) published at `/.well-known/agent-card.json` that describes an agent's identity, capabilities, skills, supported interfaces, and authentication requirements |
| **Task** | The fundamental unit of work. A client sends a message, the agent creates a task, processes it, and returns results. Tasks have a lifecycle with 9 defined states |
| **Message** | A structured communication unit containing one or more Parts (text, file, data). Messages flow between user and agent roles within a task |
| **Part** | A typed content block — `TextPart`, `FilePart`, or `DataPart` — that carries the actual payload |
| **Artifact** | An output produced by the agent during task execution (files, structured data, etc.) |
| **Streaming** | Server-Sent Events (SSE) for real-time, incremental responses |
| **Push Notifications** | Webhook-based notifications for long-running tasks |

### Protocol Bindings

A2A v1.0 supports two transport bindings:

1. **HTTP+JSON** — RESTful endpoints for send, get, list, cancel operations
2. **JSON-RPC 2.0** — All operations multiplexed over a single endpoint

### Why A2A Matters

- **Open standard** — No single vendor controls it; governed by the Linux Foundation
- **Framework-agnostic** — Works with any language, runtime, or AI framework
- **Discovery built-in** — Agents can find and understand each other automatically via Agent Cards
- **Production-ready** — Covers auth, error codes, streaming, multi-turn conversations, and task lifecycle
- **Enterprise-grade** — Supports OAuth 2.0, API keys, HTTP Bearer, and OpenID Connect for authentication

## The Gap: No Developer Tooling for A2A

While the A2A protocol defines *what* agents should do, developers building A2A-compliant agents face critical gaps:

### 1. Discovery & Inspection
> *"Is my agent's Card actually reachable and valid?"*

There's no standard tool to fetch, inspect, and validate Agent Cards. Developers resort to `curl` commands and manual JSON inspection — tedious and error-prone.

### 2. Interactive Testing
> *"Can I send a message and see what comes back?"*

Testing an agent requires writing client code from scratch every time. There's no interactive environment to quickly poke at an agent, try different messages, toggle streaming, or switch bindings.

### 3. Compliance Verification
> *"Does my agent actually follow the A2A spec?"*

The protocol has dozens of requirements — required fields, error codes, multi-turn behavior, streaming format, version headers, authentication handling. Manual verification is impractical and incomplete.

### 4. Local Development
> *"How do I test my A2A client when I don't have a live agent?"*

Developers building A2A clients or orchestrators need a reliable mock agent to test against. Without one, they can't develop or test in isolation.

### 5. CI/CD Integration
> *"How do I prevent compliance regressions?"*

There's no automated way to run compliance checks in a pipeline and fail the build if an agent breaks the spec.

## What A2A Overture Addresses

**A2A Overture** is a developer toolkit purpose-built to fill these gaps. It provides everything a developer needs to build, test, and certify A2A-compliant agents:

### Discovery & Validation
- Fetch Agent Cards from any URL with a single command
- Validate cards against the full A2A v1.0 schema
- Check required fields, skill declarations, HTTPS requirements, and security scheme structure
- Save cards locally for offline analysis

### Interactive Testing
- Send messages to any A2A agent from the CLI or Web UI
- Support for both HTTP+JSON and JSON-RPC bindings
- Streaming mode (SSE) with real-time output
- Multi-turn conversations via `contextId` and `taskId`
- Task lifecycle management — get, list, and cancel

### Compliance Certification
- **23-test compliance suite** covering:
  - Agent Card structure and accessibility
  - Message sending and task creation
  - Error handling (invalid task IDs)
  - Task lifecycle (create, get, list, cancel)
  - Streaming (SSE)
  - SubscribeToTask (SSE-based task update subscription)
  - Multi-turn conversations (context, task continuation, history)
  - Push notification capability declaration and rejection
  - Push notification config CRUD (set, get, delete)
  - Authentication enforcement and security scheme validation
  - Version header support
- Machine-readable JSON reports for CI/CD
- Selective test execution (`--only`, `--skip`)

### Mock A2A Agent
- Zero-dependency local mock server that speaks A2A v1.0
- Supports all core operations: send, get, list, cancel, stream, subscribe
- Push notification config CRUD (set, get, delete)
- Multi-turn conversation support with history
- Configurable latency, streaming, and agent identity
- Optional Bearer token authentication with proper security scheme declarations

### Web UI
- Browser-based interactive GUI for hands-on A2A testing
- All CLI capabilities available through a visual interface
- Built-in 23-test compliance suite with real-time results
- Binding selector, auth input, streaming toggle
- No external dependencies — fully self-contained

### CI/CD Ready
- Exit codes: `0` for all pass, `1` for failures
- JSON report output for pipeline integration
- Save reports to files for archiving and comparison

## Who Benefits

| Role | How A2A Overture Helps |
|---|---|
| **Agent Developers** | Validate your Agent Card, test message handling, and certify compliance before shipping |
| **Platform Engineers** | Run compliance suites in CI/CD to catch regressions early |
| **Integration Teams** | Test interoperability between agents from different vendors or teams |
| **AI Architects** | Evaluate A2A adoption readiness and identify compliance gaps |
| **QA Engineers** | Automate protocol-level testing as part of the quality process |

## Summary

The A2A protocol establishes the *how* of agent-to-agent communication. **A2A Overture** provides the *tools* to make it real — giving developers confidence that their agents speak the same language, follow the same rules, and work together reliably.

> **A2A Overture: The opening act for your A2A agents.**
