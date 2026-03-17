# A2A Overture

**The opening act for your A2A agents.**

Discover, test, and certify [A2A (Agent-to-Agent) protocol](https://a2a-protocol.org/) compliance — from the command line or browser.

```
  ╔══════════════════════════════════════╗
  ║      A 2 A   O V E R T U R E         ║
  ║ The opening act for your A2Aagents   ║
  ╚══════════════════════════════════════╝
```

## What is A2A?

The **Agent-to-Agent (A2A) protocol** is an open standard under the [Linux Foundation](https://www.linuxfoundation.org/) that defines how AI agents discover, communicate, and collaborate — regardless of vendor, framework, or deployment model. It uses JSON-RPC 2.0 over HTTP(S) and introduces core primitives like **Agent Cards** (machine-readable capability manifests), **Tasks** (units of work with lifecycle states), **Messages** and **Parts** (structured communication), and **Artifacts** (agent outputs).

A2A solves the interoperability problem: without a shared protocol, every agent-to-agent integration requires custom glue code, increasing cost and vendor lock-in.

> For a deeper dive into the business rationale, see [businessneeds.md](businessneeds.md).

## What is A2A Overture?

A2A Overture is a **developer toolkit for A2A agents**. It lets you:

- **Discover** — Fetch and inspect Agent Cards from any A2A-compliant agent
- **Validate** — Check Agent Cards against the A2A v1.0 specification
- **Send** — Send messages to agents and see responses (sync + streaming)
- **Manage** — Get, list, and cancel tasks
- **Certify** — Run a 23-test compliance suite covering multi-turn, push notifications, subscribe, auth, and more
- **Mock** — Spin up a local mock A2A agent for testing without a live service
- **Web UI** — Browser-based interactive GUI with built-in compliance testing

### Why Use This?

| Without A2A Overture | With A2A Overture |
|---|---|
| Manual `curl` to check Agent Cards | `overture discover <url>` — instant card inspection |
| Write client code to test message handling | `overture send <url> "Hello"` — one command |
| No way to verify spec compliance | `overture certify <url>` — 23 automated tests |
| Need a live agent to develop against | `overture mock` — local mock server in seconds |
| No visual testing environment | `overture web` — full GUI in the browser |

### A2A v1.0 Coverage

A2A Overture covers approximately **100% of the A2A v1.0 specification**, including all required and optional features:

- ✅ Agent Card discovery and validation (well-known URL, required fields, skills, security schemes)
- ✅ Both protocol bindings (HTTP+JSON and JSON-RPC 2.0)
- ✅ Full task lifecycle (create, get, list, cancel — all 9 task states)
- ✅ Multi-turn conversations (contextId continuation, taskId continuation, message history)
- ✅ SSE streaming with status updates
- ✅ SubscribeToTask — SSE-based task update subscription
- ✅ Push notification capability declaration and rejection
- ✅ Push notification config CRUD — set, get, delete
- ✅ Authentication (Bearer tokens, security scheme validation)
- ✅ A2A-Version header support
- ✅ Standard error codes (`-32001` TaskNotFoundError, `-32003` PushNotificationNotSupportedError, etc.)

## Quick Start

```bash
# Install globally
npm install -g a2a-overture

# Or build locally (see Local Development below)
git clone <repo-url> && cd a2a-overture
npm install && npm run build

# Start a mock agent for testing (no live agent needed!)
overture mock

# In another terminal — discover the mock agent
overture discover http://localhost:3000

# Validate a local Agent Card
overture validate ./agent-card.json

# Send a message
overture send http://localhost:3000 "What can you do?"

# Run compliance certification
overture certify http://localhost:3000

# Launch the Web UI
overture web
# Then open http://localhost:8080 in your browser
```

## Commands

### `overture discover <url>`

Fetch and display an Agent Card from an A2A agent.

```bash
overture discover https://agent.example.com
overture discover https://agent.example.com --validate
overture discover https://agent.example.com --json
overture discover https://agent.example.com --save agent-card.json
```

Options:
- `--card-url <url>` — Override the Agent Card URL
- `--validate` — Also validate the card against the spec
- `--json` — Output raw JSON
- `--save <file>` — Save the Agent Card to a file

### `overture validate <source>`

Validate an Agent Card from a URL or local file.

```bash
overture validate ./agent-card.json
overture validate https://agent.example.com/.well-known/agent-card.json
overture validate ./agent-card.json --json
```

Options:
- `--json` — Output validation result as JSON

### `overture send <url> <message>`

Send a text message to an A2A agent.

```bash
overture send https://agent.example.com "Hello, what can you do?"
overture send https://agent.example.com "Write a report" --stream
overture send https://agent.example.com "Continue" --task-id abc-123
overture send https://agent.example.com "Hello" --binding JSONRPC
```

Options:
- `--binding <type>` — `HTTP+JSON` (default) or `JSONRPC`
- `--auth <token>` — Authorization header (e.g., `"Bearer <token>"`)
- `--task-id <id>` — Continue an existing task
- `--context-id <id>` — Use a specific context
- `--stream` — Use streaming mode (SSE)
- `--json` — Output raw JSON

### `overture task get|list|cancel`

Manage A2A tasks.

```bash
overture task get https://agent.example.com task-uuid-123
overture task list https://agent.example.com --status TASK_STATE_WORKING
overture task cancel https://agent.example.com task-uuid-123
```

### `overture certify <url>`

Run the full A2A v1.0 compliance test suite.

```bash
overture certify https://agent.example.com
overture certify https://agent.example.com --json --save report.json
overture certify https://agent.example.com --only card-reachable,card-valid
overture certify https://agent.example.com --skip streaming
```

Options:
- `--binding <type>` — Protocol binding to test
- `--auth <token>` — Authorization header
- `--only <tests>` — Only run specific test IDs
- `--skip <tests>` — Skip specific test IDs
- `--json` — Output as JSON report
- `--save <file>` — Save report to file
- `--badge <file>` — Generate an SVG compliance badge
- `--html <file>` — Generate a shareable HTML compliance report
- `--timeout <ms>` — Request timeout

#### Compliance Tests

| Test ID | What it checks |
|---|---|
| `card-reachable` | Agent Card is reachable at the well-known URL |
| `card-valid` | Agent Card conforms to A2A v1.0 schema |
| `card-required-fields` | All required fields are present |
| `card-has-skills` | At least one skill is declared |
| `card-https` | Interface URLs use HTTPS |
| `send-message` | SendMessage accepts a basic text message |
| `get-task` | GetTask returns a valid task after creation |
| `invalid-task-error` | Invalid task ID returns TaskNotFoundError |
| `cancel-task` | CancelTask sets task state to CANCELED |
| `list-tasks` | ListTasks returns a task array |
| `streaming` | Streaming works (if agent declares support) |
| `version-header` | A2A-Version header is accepted |
| `multi-turn-context` | ContextId is maintained across conversation turns |
| `multi-turn-task` | TaskId continuation works for follow-up messages |
| `multi-turn-history` | GetTask returns message history after multi-turn |
| `push-notification-capability` | Push notification capability is properly declared |
| `push-notification-reject` | Push config rejected when agent doesn't support it |
| `subscribe-task` | SubscribeToTask streams task status/artifact updates via SSE |
| `push-set-config` | SetPushNotificationConfig stores push config for a task |
| `push-get-config` | GetPushNotificationConfig retrieves stored push config |
| `push-delete-config` | DeletePushNotificationConfig removes push config |
| `auth-unauthorized` | Unauthenticated requests rejected when auth required |
| `auth-security-schemes` | Declared security schemes have valid structure |

## CI/CD Integration

### GitHub Action

A2A Overture includes a ready-to-use GitHub Action for automated compliance testing in pull requests:

```yaml
# .github/workflows/a2a-compliance.yml
name: A2A Compliance Check
on: [pull_request]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start agent
        run: npm start &

      - name: A2A Compliance Check
        uses: a2a-overture/a2a-overture@v1
        with:
          agent-url: http://localhost:3000
          badge-output: a2a-badge.svg
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The action posts a detailed compliance report as a PR comment, generates step summaries, and outputs machine-readable results. See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md) for full documentation.

### CLI in Pipelines

```bash
# Fail the pipeline if the agent isn't compliant
overture certify https://my-agent.example.com --json --save report.json
# Exit code: 0 = all pass, 1 = failures found

# Generate a compliance badge
overture certify https://my-agent.example.com --badge a2a-badge.svg

# Generate a shareable HTML report
overture certify https://my-agent.example.com --html report.html
```

Example output against the mock server:
```
  ✔ Agent Card is reachable (5ms)
  ✔ Agent Card schema is valid (3ms)
  ✔ Required fields are present (2ms)
  ✔ Agent declares at least one skill (5ms)
  ✔ Interface URLs use HTTPS (3ms)
  ✔ SendMessage accepts a basic text message (4ms)
  ✔ GetTask returns a valid task (3ms)
  ✔ Invalid task ID returns TaskNotFoundError
  ✔ CancelTask cancels a running task (2ms)
  ✔ ListTasks returns task list (2ms)
  ✔ Streaming works (if supported) (619ms)
  ✔ A2A-Version header is accepted (6ms)
  ✔ Multi-turn conversation via contextId (3ms)
  ✔ Multi-turn via taskId continuation (3ms)
  ✔ Task history includes previous messages (4ms)
  ✔ Push notification capability is declared
  ○ Push config rejected when unsupported
  ✔ SubscribeToTask streams task updates (2ms)
  ✔ SetPushNotificationConfig stores config (3ms)
  ✔ GetPushNotificationConfig retrieves config (2ms)
  ✔ DeletePushNotificationConfig removes config (1ms)
  ✔ Agent rejects unauthenticated requests when auth required
  ✔ Security schemes are well-formed

  PASS  22 passed  0 failed  1 skipped
```

### `overture mock`

Start a local mock A2A agent for testing — no live agent needed.

```bash
overture mock
overture mock --port 4000
overture mock --name "Test Agent" --latency 500
overture mock --no-streaming
overture mock --auth-token secret123
```

The mock agent supports:
- **Echo** — repeats back your message
- **Greeting** — responds with a friendly hello
- **Long Task** — simulates multi-step processing
- **Multi-turn** — maintains context and history across conversation turns
- **Task lifecycle** — create, get, list, cancel tasks
- **SubscribeToTask** — SSE-based task update subscription
- **Push notification config CRUD** — set, get, and delete push notification configs per task
- **SSE streaming** — word-by-word streaming responses with status updates
- **Bearer token auth** — optional `--auth-token` flag adds security schemes to the Agent Card and enforces 401 on unauthenticated requests

Options:
- `-p, --port <port>` — Port to listen on (default: `3000`)
- `--host <host>` — Host to bind to (default: `localhost`)
- `--name <name>` — Agent name
- `--description <desc>` — Agent description
- `--no-streaming` — Disable streaming support
- `--latency <ms>` — Simulated response latency in milliseconds
- `--auth-token <token>` — Require Bearer token auth (agent card will declare `securitySchemes`)

Endpoints served:
| Endpoint | Method | Description |
|---|---|---|
| `/.well-known/agent-card.json` | GET | Agent Card discovery |
| `/message:send` | POST | Send a message (HTTP+JSON) |
| `/message:stream` | POST | Send with streaming (SSE) |
| `/tasks/:id` | GET | Get a task by ID |
| `/tasks` | GET | List all tasks |
| `/tasks/:id:cancel` | POST | Cancel a task |
| `/tasks/:id:subscribe` | POST | Subscribe to task updates (SSE) |
| `/tasks/:id/pushNotificationConfig` | POST | Set push notification config |
| `/tasks/:id/pushNotificationConfig` | GET | Get push notification config |
| `/tasks/:id/pushNotificationConfig` | DELETE | Delete push notification config |
| `/` | POST | JSON-RPC 2.0 endpoint |

### `overture web`

Launch a browser-based Web UI for interactive A2A testing.

```bash
overture web
overture web --port 9090
```

Then open `http://localhost:8080` in your browser. Features:
- **Discover / Validate / Send / Certify** — all actions in the browser
- **Pretty response rendering** — Agent Cards, tasks, compliance reports
- **Binding selector** — HTTP+JSON or JSON-RPC
- **Custom headers** — add auth tokens and extra headers
- **Streaming toggle** — test SSE streaming mode
- **23-test compliance suite** — full A2A v1.0 coverage: agent card validation, task lifecycle, streaming, subscribe, multi-turn, push notifications, push config CRUD, auth, version header

Options:
- `-p, --port <port>` — Port to listen on (default: `8080`)
- `--host <host>` — Host to bind to (default: `localhost`)

> **Tip:** Run `overture mock` and `overture web` side by side for a fully self-contained demo.

### `overture registry`

Manage the public A2A compliance registry — a searchable directory of certified agents.

```bash
# Start the registry server
overture registry serve --port 3335

# Publish compliance results
overture certify https://my-agent.com --json --save report.json
overture registry publish report.json --registry http://localhost:3335

# List registered agents
overture registry list --registry http://localhost:3335
```

The registry provides:
- **Web UI** at `http://localhost:3335` — browse all registered agents
- **REST API** — `GET /api/entries`, `POST /api/entries`, `DELETE /api/entries/:id`
- **Dynamic badges** — `GET /api/entries/:id/badge.svg` for live compliance status

### "A2A Certified" Badge

Generate compliance badges for your README:

```bash
# Generate a local badge
overture certify https://my-agent.com --badge a2a-badge.svg

# Or use registry-hosted badges (always up-to-date)
![A2A Certified](https://your-registry.com/api/entries/ENTRY_ID/badge.svg)
```

Add to your README:
```markdown
![A2A Certified](a2a-badge.svg)
```

## Programmatic Usage

```typescript
import { A2AClient } from 'a2a-overture/core/client';
import { validateAgentCard } from 'a2a-overture/core/validator';
import { runComplianceSuite } from 'a2a-overture/core/compliance/runner';

// Create a client
const client = new A2AClient({
  baseUrl: 'https://my-agent.example.com',
  binding: 'HTTP+JSON',
});

// Discover
const card = await client.discoverAgentCard();

// Validate
const result = validateAgentCard(card);
console.log(result.valid); // true/false

// Send a message
const response = await client.sendMessage(
  client.createTextMessage('Hello!')
);

// Run compliance suite
const report = await runComplianceSuite({
  baseUrl: 'https://my-agent.example.com',
  binding: 'HTTP+JSON',
});
console.log(`${report.summary.passed}/${report.summary.total} tests passed`);
```

## Project Structure

```
a2a-overture/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── cli/
│   │   ├── index.ts                # CLI setup (8 commands)
│   │   └── commands/
│   │       ├── discover.ts         # overture discover
│   │       ├── validate.ts         # overture validate
│   │       ├── send.ts             # overture send
│   │       ├── task.ts             # overture task get|list|cancel
│   │       ├── certify.ts          # overture certify (+ --badge, --html)
│   │       ├── mock.ts             # overture mock
│   │       ├── web.ts              # overture web
│   │       └── registry.ts         # overture registry serve|publish|list
│   ├── core/
│   │   ├── types.ts                # A2A v1.0 protocol types
│   │   ├── client.ts               # A2A HTTP+JSON & JSON-RPC client
│   │   ├── validator.ts            # Agent Card validator
│   │   ├── spec-versions.ts        # Spec version tracking & coverage map
│   │   └── compliance/
│   │       ├── runner.ts           # Compliance test runner
│   │       └── tests/
│   │           └── a2a-v1.ts       # A2A v1.0 compliance tests (23)
│   ├── mock/
│   │   └── server.ts              # Mock A2A agent server
│   ├── registry/
│   │   └── server.ts              # Public compliance registry
│   ├── web/
│   │   └── server.ts              # Web UI server
│   ├── action/
│   │   └── index.ts               # GitHub Action entrypoint
│   └── reporters/
│       ├── console.ts              # Pretty terminal output
│       ├── json.ts                 # JSON report output
│       ├── badge.ts                # SVG badge generator
│       └── html.ts                 # Shareable HTML report
├── action/
│   └── action.yml                  # GitHub Action definition
├── .github/
│   └── workflows/
│       └── a2a-compliance.yml      # CI self-test workflow
├── docs/
│   ├── GITHUB_ACTION.md            # GitHub Action documentation
│   └── WORKING_GROUP_PROPOSAL.md   # A2A working group proposal
├── examples/
│   ├── sample-agent-card.json
│   └── invalid-agent-card.json
├── package.json
├── tsconfig.json
└── README.md
```

## Local Development

```bash
# Clone the repo
git clone <repo-url>
cd a2a-overture

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run any command via node
node dist/index.js --help
node dist/index.js mock
node dist/index.js web

# Or use npm scripts
npm run mock           # Start mock server on port 3000
npm run web            # Start Web UI on port 8080

# Validate an Agent Card
node dist/index.js validate examples/sample-agent-card.json

# Link globally for development (makes `overture` command available)
npm link
overture --help
```

### NPM Scripts

| Script | Command | Description |
|---|---|---|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/index.js` | Run the CLI |
| `npm run mock` | `node dist/index.js mock` | Start mock A2A agent |
| `npm run web` | `node dist/index.js web` | Start Web UI |
| `npm run dev` | `ts-node src/index.ts` | Run directly from TypeScript |

## Tested Against Real A2A Agents

A2A Overture has been validated against **8 real A2A agents** spanning Python, .NET, and our built-in mock — across three protocol versions (v1.0, v0.3.0, v0.2.6). Overture automatically detects agent protocol versions, adapts JSON-RPC method names, role values, and part discriminators accordingly.

| Agent | SDK | Protocol | Passed | Failed | Warn | Skipped | Notes |
|-------|-----|----------|--------|--------|------|---------|-------|
| **Overture Mock** | Built-in | v1.0 | 20 | 0 | 0 | 3 | Full compliance baseline |
| **AgentCarol** | Python (a2a-sdk) | v0.3.0 | 11 | 2 | 2 | 8 | Best third-party score; full task lifecycle |
| **AgentAlice** | Python (a2a-sdk) | v0.3.0 | 9 | 5 | 1 | 8 | Tasks complete instantly → cancel/continue fail |
| **EchoServer** | .NET (A2A NuGet) | v0.2.6 | 7 | 3 | 1 | 12 | Message-only echo; streaming works |
| **CalculatorServer** | .NET (A2A NuGet) | v0.2.6 | 7 | 3 | 1 | 12 | Evaluates math expressions |
| **CLIServer** | .NET (A2A NuGet) | v0.2.6 | 7 | 3 | 1 | 12 | Executes CLI commands |
| **Signed Agent** | Python (a2a-sdk) | v0.3.0 | 6 | 2 | 2 | 13 | Signing & verification demo |
| **Hello World** | Python (a2a-sdk) | v0.3.0 | 6 | 2 | 0 | 13 | Message-only (no tasks) |

> All agents are from the [official a2a-samples repository](https://github.com/a2aproject/a2a-samples).

### Key Findings

- **All pre-v1.0 agents** are missing `supportedInterfaces` (required in v1.0) — flagged correctly as compliance gaps
- **.NET v0.2.6 agents** require the `kind` type discriminator as the **first JSON property** in Part objects (System.Text.Json polymorphic deserialization requirement) — Overture handles this automatically
- **.NET agents** serve their agent card at `.well-known/agent.json` (not `agent-card.json`) — Overture falls back automatically
- **AgentCarol** achieves the highest third-party score (11/23) with full task lifecycle support including multi-turn, history, and streaming
- **Streaming** works across Python v0.3.0 and .NET v0.2.6 agents
- **Auto-detection** of protocol version, binding, RPC endpoint URL, and agent card path ensures broad compatibility with zero configuration

### Protocol Compatibility

Overture supports A2A protocol versions v1.0, v0.3.x, and v0.2.x:

| Feature | v1.0 | v0.3.x / v0.2.x |
|---------|------|------------------|
| Method names | PascalCase (`SendMessage`) | Slash-separated (`message/send`) |
| Role values | `ROLE_USER` / `ROLE_AGENT` | `user` / `agent` |
| Part discriminator | Optional `kind` field | **Required** `kind` as first property |
| Agent card URL | `.well-known/agent-card.json` | `.well-known/agent.json` (fallback) |
| Binding | HTTP+JSON or JSONRPC | Auto-switches to JSONRPC |

## Roadmap

- [x] Full A2A v1.0 compliance test suite (23 tests, 100% coverage)
- [x] GitHub Action for CI/CD integration
- [x] "A2A Certified" badge program with SVG generation
- [x] Shareable HTML compliance reports
- [x] Public compliance registry with web UI
- [x] Spec version tracking infrastructure
- [x] npm published as [`a2a-overture`](https://www.npmjs.com/package/a2a-overture)
- [x] Tested against real A2A agents (official a2a-samples)
- [x] Protocol v0.3.x backward compatibility (auto-detection)
- [x] .NET v0.2.6 compatibility (part discriminators, agent card fallback)
- [x] Cross-platform validation (Python + .NET + built-in, 8 agents total)
- [ ] Hosted public registry instance
- [ ] A2A v1.1+ test coverage (as spec evolves)

## License

Apache-2.0
