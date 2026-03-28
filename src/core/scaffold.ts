import * as fs from 'fs';
import * as path from 'path';

export type SdkLanguage = 'python' | 'typescript' | 'go';

export interface InitOptions {
  sdk: SdkLanguage;
  name: string;
  description: string;
  port: number;
  outDir: string;
}

export function scaffoldAgent(opts: InitOptions): string[] {
  const created: string[] = [];
  const dir = path.resolve(opts.outDir);
  fs.mkdirSync(dir, { recursive: true });

  switch (opts.sdk) {
    case 'python':
      created.push(...scaffoldPython(dir, opts));
      break;
    case 'typescript':
      created.push(...scaffoldTypeScript(dir, opts));
      break;
    case 'go':
      created.push(...scaffoldGo(dir, opts));
      break;
  }

  return created;
}

function write(filePath: string, content: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── Python ──────────────────────────────────────────────

function scaffoldPython(dir: string, opts: InitOptions): string[] {
  const files: string[] = [];

  files.push(write(path.join(dir, 'pyproject.toml'), `[project]
name = "${opts.name}"
version = "0.1.0"
description = "${opts.description}"
requires-python = ">=3.10"
dependencies = [
    "a2a-sdk>=0.2.0",
    "uvicorn>=0.30.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`));

  files.push(write(path.join(dir, 'agent_card.json'), JSON.stringify({
    name: opts.name,
    description: opts.description,
    version: '1.0.0',
    protocolVersion: '1.0',
    url: `http://localhost:${opts.port}`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'default',
        name: 'Default Skill',
        description: 'Responds to user messages',
        tags: ['general'],
        examples: ['Hello', 'What can you do?'],
      },
    ],
    supportedInterfaces: [
      {
        protocol: 'A2A',
        versions: ['1.0'],
        url: `http://localhost:${opts.port}`,
      },
    ],
  }, null, 2) + '\n'));

  files.push(write(path.join(dir, 'agent.py'), `"""${opts.name} — A2A-compliant agent."""

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.types import AgentCard, Message, Part, Role, TextPart
import json
import uvicorn


class ${toPascalCase(opts.name)}Executor(AgentExecutor):
    """Simple agent executor that echoes back messages."""

    async def execute(self, context: RequestContext, event_queue) -> None:
        user_msg = context.get_user_message()
        user_text = ""
        if user_msg and user_msg.parts:
            for part in user_msg.parts:
                if hasattr(part, "root") and hasattr(part.root, "text"):
                    user_text += part.root.text

        response = Message(
            role=Role.agent,
            parts=[Part(root=TextPart(text=f"Echo: {user_text}"))],
            messageId=context.message.messageId + "-response",
        )
        await event_queue.enqueue_event(response)

    async def cancel(self, context: RequestContext, event_queue) -> None:
        pass


def load_agent_card() -> AgentCard:
    with open("agent_card.json") as f:
        return AgentCard(**json.load(f))


def main():
    card = load_agent_card()
    executor = ${toPascalCase(opts.name)}Executor()
    handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=None,
    )
    app = A2AStarletteApplication(
        agent_card=card,
        http_handler=handler,
    )
    uvicorn.run(app.build(), host="0.0.0.0", port=${opts.port})


if __name__ == "__main__":
    main()
`));

  files.push(write(path.join(dir, 'README.md'), `# ${opts.name}

${opts.description}

## Quick Start

\`\`\`bash
# Install dependencies
pip install -e .

# Run the agent
python agent.py
\`\`\`

The agent will be available at \`http://localhost:${opts.port}\`.

## Verify Compliance

\`\`\`bash
npx a2a-overture certify http://localhost:${opts.port}
\`\`\`
`));

  return files;
}

// ─── TypeScript ──────────────────────────────────────────

function scaffoldTypeScript(dir: string, opts: InitOptions): string[] {
  const files: string[] = [];

  files.push(write(path.join(dir, 'package.json'), JSON.stringify({
    name: opts.name,
    version: '0.1.0',
    description: opts.description,
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js',
      dev: 'ts-node src/index.ts',
    },
    dependencies: {},
    devDependencies: {
      typescript: '^5.6.0',
      'ts-node': '^10.9.2',
      '@types/node': '^22.0.0',
    },
  }, null, 2) + '\n'));

  files.push(write(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
    },
    include: ['src'],
  }, null, 2) + '\n'));

  const agentCard = {
    name: opts.name,
    description: opts.description,
    version: '1.0.0',
    protocolVersion: '1.0',
    url: `http://localhost:${opts.port}`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'default',
        name: 'Default Skill',
        description: 'Responds to user messages',
        tags: ['general'],
        examples: ['Hello', 'What can you do?'],
      },
    ],
    supportedInterfaces: [
      {
        protocol: 'A2A',
        versions: ['1.0'],
        url: `http://localhost:${opts.port}`,
      },
    ],
  };

  files.push(write(path.join(dir, 'src', 'index.ts'), `import * as http from 'http';

const PORT = ${opts.port};

const agentCard = ${JSON.stringify(agentCard, null, 2)};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', \`http://\${req.headers.host}\`);

  // Agent Card discovery
  if (url.pathname === '/.well-known/agent-card.json' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agentCard));
    return;
  }

  // SendMessage (HTTP+JSON binding)
  if (url.pathname === '/message:send' && req.method === 'POST') {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    const userText = parsed?.message?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join(' ') || '';

    const taskId = crypto.randomUUID();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: {
        id: taskId,
        contextId: taskId,
        status: { state: 'completed' },
        messages: [
          parsed.message,
          {
            messageId: crypto.randomUUID(),
            role: 'agent',
            parts: [{ text: \`Echo: \${userText}\` }],
          },
        ],
      },
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(\`${opts.name} listening on http://localhost:\${PORT}\`);
  console.log('Agent Card: http://localhost:' + PORT + '/.well-known/agent-card.json');
});
`));

  files.push(write(path.join(dir, 'README.md'), `# ${opts.name}

${opts.description}

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

The agent will be available at \`http://localhost:${opts.port}\`.

## Verify Compliance

\`\`\`bash
npx a2a-overture certify http://localhost:${opts.port}
\`\`\`
`));

  return files;
}

// ─── Go ──────────────────────────────────────────────────

function scaffoldGo(dir: string, opts: InitOptions): string[] {
  const files: string[] = [];

  files.push(write(path.join(dir, 'go.mod'), `module ${opts.name}

go 1.22
`));

  const agentCardJson = JSON.stringify({
    name: opts.name,
    description: opts.description,
    version: '1.0.0',
    protocolVersion: '1.0',
    url: `http://localhost:${opts.port}`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'default',
        name: 'Default Skill',
        description: 'Responds to user messages',
        tags: ['general'],
        examples: ['Hello', 'What can you do?'],
      },
    ],
    supportedInterfaces: [
      {
        protocol: 'A2A',
        versions: ['1.0'],
        url: `http://localhost:${opts.port}`,
      },
    ],
  }, null, 2);

  files.push(write(path.join(dir, 'main.go'), `package main

import (
\t"encoding/json"
\t"fmt"
\t"log"
\t"net/http"
\t"strings"

\t"github.com/google/uuid"
)

var agentCard = \`${agentCardJson.replace(/`/g, '` + "`" + `')}\`

func main() {
\thttp.HandleFunc("/.well-known/agent-card.json", handleAgentCard)
\thttp.HandleFunc("/message:send", handleSendMessage)

\taddr := fmt.Sprintf(":%d", ${opts.port})
\tlog.Printf("${opts.name} listening on http://localhost%s", addr)
\tlog.Fatal(http.ListenAndServe(addr, nil))
}

func handleAgentCard(w http.ResponseWriter, r *http.Request) {
\tw.Header().Set("Content-Type", "application/json")
\tw.Write([]byte(agentCard))
}

func handleSendMessage(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\thttp.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
\t\treturn
\t}

\tvar req map[string]interface{}
\tif err := json.NewDecoder(r.Body).Decode(&req); err != nil {
\t\thttp.Error(w, "Invalid JSON", http.StatusBadRequest)
\t\treturn
\t}

\tuserText := extractText(req)
\ttaskID := uuid.New().String()

\tresponse := map[string]interface{}{
\t\t"task": map[string]interface{}{
\t\t\t"id":        taskID,
\t\t\t"contextId": taskID,
\t\t\t"status":    map[string]interface{}{"state": "completed"},
\t\t\t"messages": []interface{}{
\t\t\t\treq["message"],
\t\t\t\tmap[string]interface{}{
\t\t\t\t\t"messageId": uuid.New().String(),
\t\t\t\t\t"role":      "agent",
\t\t\t\t\t"parts":     []interface{}{map[string]interface{}{"text": fmt.Sprintf("Echo: %s", userText)}},
\t\t\t\t},
\t\t\t},
\t\t},
\t}

\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(response)
}

func extractText(req map[string]interface{}) string {
\tmsg, ok := req["message"].(map[string]interface{})
\tif !ok {
\t\treturn ""
\t}
\tparts, ok := msg["parts"].([]interface{})
\tif !ok {
\t\treturn ""
\t}
\tvar texts []string
\tfor _, p := range parts {
\t\tif pm, ok := p.(map[string]interface{}); ok {
\t\t\tif t, ok := pm["text"].(string); ok {
\t\t\t\ttexts = append(texts, t)
\t\t\t}
\t\t}
\t}
\treturn strings.Join(texts, " ")
}
`));

  files.push(write(path.join(dir, 'README.md'), `# ${opts.name}

${opts.description}

## Quick Start

\`\`\`bash
go run main.go
\`\`\`

The agent will be available at \`http://localhost:${opts.port}\`.

## Verify Compliance

\`\`\`bash
npx a2a-overture certify http://localhost:${opts.port}
\`\`\`
`));

  return files;
}

// ─── Helpers ─────────────────────────────────────────────

function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}
