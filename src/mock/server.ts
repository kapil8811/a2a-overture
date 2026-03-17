import * as http from 'http';
import * as crypto from 'crypto';
import { AgentCard, Task, TaskState, Role, Artifact, Message, SendMessageRequest, JsonRpcRequest, JsonRpcResponse, A2AErrorCodes, PushNotificationConfig } from '../core/types';

export interface MockServerOptions {
  port: number;
  host?: string;
  name?: string;
  description?: string;
  streaming?: boolean;
  latency?: number; // simulated response delay in ms
  authToken?: string; // if set, require Bearer token auth
}

interface StoredTask {
  task: Task;
  createdAt: number;
}

export class MockA2AServer {
  private server: http.Server | null = null;
  private tasks = new Map<string, StoredTask>();
  private pushConfigs = new Map<string, PushNotificationConfig>();
  private options: Required<MockServerOptions>;

  constructor(options: MockServerOptions) {
    this.options = {
      host: 'localhost',
      name: 'Overture Mock Agent',
      description: 'A mock A2A agent for testing and development',
      streaming: true,
      latency: 0,
      authToken: '',
      ...options,
    };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('error', reject);
      this.server.listen(this.options.port, this.options.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  get url(): string {
    return `http://${this.options.host}:${this.options.port}`;
  }

  private buildAgentCard(): AgentCard {
    return {
      name: this.options.name,
      description: this.options.description,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: this.url,
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
        {
          url: this.url,
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      capabilities: {
        streaming: this.options.streaming,
        pushNotifications: true,
      },
      ...(this.options.authToken ? {
        securitySchemes: {
          bearer: {
            httpAuthSecurityScheme: {
              scheme: 'Bearer',
              bearerFormat: 'Opaque token',
              description: 'Bearer token authentication',
            },
          },
        },
        securityRequirements: [{ bearer: [] }],
      } : {}),
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      skills: [
        {
          id: 'echo',
          name: 'Echo',
          description: 'Echoes back the message you send',
          tags: ['utility', 'test'],
          examples: ['Hello, world!', 'Echo this back to me'],
        },
        {
          id: 'greet',
          name: 'Greeting',
          description: 'Generates a friendly greeting',
          tags: ['demo', 'greeting'],
          examples: ['Hi there', 'Greet me'],
        },
        {
          id: 'long-task',
          name: 'Long Running Task',
          description: 'Simulates a multi-step long-running task with status updates',
          tags: ['demo', 'async'],
          examples: ['Run a long task', 'Start a background process'],
        },
      ],
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, A2A-Version, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'A2A-Version');
    res.setHeader('A2A-Version', '1.0');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // Agent Card discovery — always public (no auth required)
      if (path === '/.well-known/agent-card.json' && req.method === 'GET') {
        return this.sendJson(res, 200, this.buildAgentCard());
      }

      // Auth check — all other endpoints require Bearer token when authToken is set
      if (this.options.authToken) {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (token !== this.options.authToken) {
          res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
          res.end(JSON.stringify({
            error: { code: 401, status: 'UNAUTHENTICATED', message: 'Missing or invalid Bearer token' },
          }));
          return;
        }
      }

      // Try to detect JSON-RPC 
      if (req.method === 'POST' && path === '/') {
        const body = await this.readBody(req);
        if (body && typeof body === 'object' && 'jsonrpc' in body) {
          return this.handleJsonRpc(body as JsonRpcRequest, res);
        }
      }

      // HTTP+JSON routes
      if (path === '/message:send' && req.method === 'POST') {
        const body = await this.readBody(req) as SendMessageRequest;
        return this.handleSendMessage(body, res);
      }

      if (path === '/message:stream' && req.method === 'POST') {
        const body = await this.readBody(req) as SendMessageRequest;
        return this.handleStreamMessage(body, res);
      }

      // Task routes
      const taskMatch = path.match(/^\/tasks\/([^/:]+)$/);
      if (taskMatch && req.method === 'GET') {
        return this.handleGetTask(taskMatch[1], url, res);
      }

      const cancelMatch = path.match(/^\/tasks\/([^/:]+):cancel$/);
      if (cancelMatch && req.method === 'POST') {
        return this.handleCancelTask(cancelMatch[1], res);
      }

      // Subscribe to task (SSE)
      const subscribeMatch = path.match(/^\/tasks\/([^/:]+):subscribe$/);
      if (subscribeMatch && req.method === 'POST') {
        return this.handleSubscribeToTask(subscribeMatch[1], res);
      }

      // Push notification config CRUD
      const pushConfigMatch = path.match(/^\/tasks\/([^/:]+)\/pushNotificationConfig$/);
      if (pushConfigMatch) {
        const taskId = pushConfigMatch[1];
        if (req.method === 'POST') {
          const body = await this.readBody(req) as { taskId: string; pushNotificationConfig: PushNotificationConfig };
          return this.handleSetPushConfig(taskId, body.pushNotificationConfig, res);
        }
        if (req.method === 'GET') {
          return this.handleGetPushConfig(taskId, res);
        }
        if (req.method === 'DELETE') {
          return this.handleDeletePushConfig(taskId, res);
        }
      }

      if (path === '/tasks' && req.method === 'GET') {
        return this.handleListTasks(url, res);
      }

      this.sendJson(res, 404, { error: 'Not found' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      this.sendJson(res, 500, { error: message });
    }
  }

  // ─── JSON-RPC Handler ──────────────────────────────────

  private async handleJsonRpc(request: JsonRpcRequest, res: http.ServerResponse) {
    const { method, params, id } = request;

    try {
      let result: unknown;
      switch (method) {
        case 'SendMessage':
          try {
            result = this.processMessage(params as unknown as SendMessageRequest);
          } catch (err: unknown) {
            const e = err as { code?: number; message?: string };
            if (e.code) {
              return this.sendJsonRpcError(res, id, e.code, e.message || 'Error');
            }
            throw err;
          }
          break;
        case 'SendStreamingMessage':
          return this.handleJsonRpcStream(params as unknown as SendMessageRequest, id, res);
        case 'GetTask': {
          const p = params as Record<string, unknown>;
          const task = this.tasks.get(p.id as string);
          if (!task) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          result = task.task;
          break;
        }
        case 'ListTasks':
          result = { tasks: Array.from(this.tasks.values()).map(t => t.task) };
          break;
        case 'CancelTask': {
          const p = params as Record<string, unknown>;
          const stored = this.tasks.get(p.id as string);
          if (!stored) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          stored.task.status = {
            state: TaskState.CANCELED,
            timestamp: new Date().toISOString(),
          };
          result = stored.task;
          break;
        }
        case 'GetExtendedAgentCard':
          result = this.buildAgentCard();
          break;
        case 'SubscribeToTask': {
          const p = params as Record<string, unknown>;
          const taskId = p.id as string;
          const stored = this.tasks.get(taskId);
          if (!stored) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          return this.handleSubscribeToTaskSSE(stored.task, id, res);
        }
        case 'SetPushNotificationConfig': {
          const p = params as Record<string, unknown>;
          const taskId = p.taskId as string;
          if (!this.tasks.has(taskId)) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          const config = p.pushNotificationConfig as PushNotificationConfig;
          this.pushConfigs.set(taskId, config);
          result = config;
          break;
        }
        case 'GetPushNotificationConfig': {
          const p = params as Record<string, unknown>;
          const taskId = p.taskId as string;
          if (!this.tasks.has(taskId)) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          const config = this.pushConfigs.get(taskId);
          if (!config) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'No push notification config for this task');
          }
          result = config;
          break;
        }
        case 'DeletePushNotificationConfig': {
          const p = params as Record<string, unknown>;
          const taskId = p.taskId as string;
          if (!this.tasks.has(taskId)) {
            return this.sendJsonRpcError(res, id, A2AErrorCodes.TASK_NOT_FOUND, 'Task not found');
          }
          this.pushConfigs.delete(taskId);
          result = { success: true };
          break;
        }
        default:
          return this.sendJsonRpcError(res, id, -32601, `Method not found: ${method}`);
      }

      if (this.options.latency > 0) {
        await this.delay(this.options.latency);
      }

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id,
        result,
      };
      this.sendJson(res, 200, response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendJsonRpcError(res, id, -32000, message);
    }
  }

  // ─── HTTP+JSON Handlers ────────────────────────────────

  private async handleSendMessage(request: SendMessageRequest, res: http.ServerResponse) {
    if (this.options.latency > 0) {
      await this.delay(this.options.latency);
    }
    try {
      const result = this.processMessage(request);
      this.sendJson(res, 200, result);
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code === A2AErrorCodes.PUSH_NOTIFICATION_NOT_SUPPORTED) {
        this.sendJson(res, 400, { error: { code: e.code, message: e.message } });
      } else {
        const message = err instanceof Error ? err.message : 'Internal server error';
        this.sendJson(res, 500, { error: message });
      }
    }
  }

  private async handleStreamMessage(request: SendMessageRequest, res: http.ServerResponse) {
    if (!this.options.streaming) {
      this.sendJson(res, 400, { error: 'Streaming not supported' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'A2A-Version': '1.0',
      'Access-Control-Allow-Origin': '*',
    });

    const taskId = request.message.taskId || crypto.randomUUID();
    const contextId = request.message.contextId || crypto.randomUUID();
    const inputText = this.extractText(request.message);

    // Send status: WORKING
    this.writeSSE(res, {
      statusUpdate: {
        taskId,
        contextId,
        status: { state: TaskState.WORKING, timestamp: new Date().toISOString() },
      },
    });

    await this.delay(this.options.latency > 0 ? this.options.latency : 200);

    // Send artifact chunks
    const responseText = `Mock echo: ${inputText}`;
    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = (i > 0 ? ' ' : '') + words[i];
      this.writeSSE(res, {
        artifactUpdate: {
          taskId,
          contextId,
          artifact: {
            artifactId: 'response-1',
            parts: [{ text: chunk }],
          },
          append: i > 0,
          lastChunk: i === words.length - 1,
        },
      });
      await this.delay(50);
    }

    // Send status: COMPLETED
    this.writeSSE(res, {
      statusUpdate: {
        taskId,
        contextId,
        status: { state: TaskState.COMPLETED, timestamp: new Date().toISOString() },
      },
    });

    // Store the final task
    const task: Task = {
      id: taskId,
      contextId,
      status: { state: TaskState.COMPLETED, timestamp: new Date().toISOString() },
      artifacts: [{
        artifactId: 'response-1',
        parts: [{ text: responseText }],
      }],
    };
    this.tasks.set(taskId, { task, createdAt: Date.now() });

    res.end();
  }

  private handleJsonRpcStream(request: SendMessageRequest, rpcId: string | number, res: http.ServerResponse) {
    // Reuse the HTTP stream logic — JSON-RPC streaming wraps each event in a JSON-RPC response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'A2A-Version': '1.0',
      'Access-Control-Allow-Origin': '*',
    });

    const taskId = request.message.taskId || crypto.randomUUID();
    const contextId = request.message.contextId || crypto.randomUUID();
    const inputText = this.extractText(request.message);
    const responseText = `Mock echo: ${inputText}`;

    const sendRpcSSE = (result: unknown) => {
      const rpcResponse: JsonRpcResponse = { jsonrpc: '2.0', id: rpcId, result };
      res.write(`data: ${JSON.stringify(rpcResponse)}\n\n`);
    };

    // Working
    sendRpcSSE({
      statusUpdate: { taskId, contextId, status: { state: TaskState.WORKING, timestamp: new Date().toISOString() } },
    });

    // completed
    setTimeout(() => {
      sendRpcSSE({
        statusUpdate: { taskId, contextId, status: { state: TaskState.COMPLETED, timestamp: new Date().toISOString() } },
      });

      const task: Task = {
        id: taskId,
        contextId,
        status: { state: TaskState.COMPLETED, timestamp: new Date().toISOString() },
        artifacts: [{ artifactId: 'response-1', parts: [{ text: responseText }] }],
      };
      this.tasks.set(taskId, { task, createdAt: Date.now() });

      res.end();
    }, this.options.latency > 0 ? this.options.latency : 300);
  }

  private handleGetTask(taskId: string, url: URL, res: http.ServerResponse) {
    const stored = this.tasks.get(taskId);
    if (!stored) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    this.sendJson(res, 200, stored.task);
  }

  private handleCancelTask(taskId: string, res: http.ServerResponse) {
    const stored = this.tasks.get(taskId);
    if (!stored) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    stored.task.status = {
      state: TaskState.CANCELED,
      timestamp: new Date().toISOString(),
    };
    this.sendJson(res, 200, stored.task);
  }

  private handleListTasks(url: URL, res: http.ServerResponse) {
    let tasks = Array.from(this.tasks.values()).map(t => t.task);

    const contextId = url.searchParams.get('contextId');
    if (contextId) {
      tasks = tasks.filter(t => t.contextId === contextId);
    }

    const status = url.searchParams.get('status');
    if (status) {
      tasks = tasks.filter(t => t.status.state === status);
    }

    this.sendJson(res, 200, { tasks, nextPageToken: '', pageSize: tasks.length, totalSize: tasks.length });
  }

  // ─── Subscribe to Task (SSE) ───────────────────────────

  private handleSubscribeToTask(taskId: string, res: http.ServerResponse) {
    const stored = this.tasks.get(taskId);
    if (!stored) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    this.handleSubscribeToTaskSSE(stored.task, null, res);
  }

  private handleSubscribeToTaskSSE(task: Task, rpcId: string | number | null, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'A2A-Version': '1.0',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (data: unknown) => {
      if (rpcId !== null) {
        const rpcResponse: JsonRpcResponse = { jsonrpc: '2.0', id: rpcId, result: data };
        res.write(`data: ${JSON.stringify(rpcResponse)}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Emit current status
    sendEvent({
      statusUpdate: {
        taskId: task.id,
        contextId: task.contextId || '',
        status: task.status,
      },
    });

    // If task has artifacts, emit them
    if (task.artifacts) {
      for (const artifact of task.artifacts) {
        sendEvent({
          artifactUpdate: {
            taskId: task.id,
            contextId: task.contextId || '',
            artifact,
            append: false,
            lastChunk: true,
          },
        });
      }
    }

    res.end();
  }

  // ─── Push Notification Config CRUD ─────────────────────

  private handleSetPushConfig(taskId: string, config: PushNotificationConfig, res: http.ServerResponse) {
    if (!this.tasks.has(taskId)) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    this.pushConfigs.set(taskId, config);
    this.sendJson(res, 200, config);
  }

  private handleGetPushConfig(taskId: string, res: http.ServerResponse) {
    if (!this.tasks.has(taskId)) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    const config = this.pushConfigs.get(taskId);
    if (!config) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'No push notification config for this task' },
      });
      return;
    }
    this.sendJson(res, 200, config);
  }

  private handleDeletePushConfig(taskId: string, res: http.ServerResponse) {
    if (!this.tasks.has(taskId)) {
      this.sendJson(res, 404, {
        error: { code: A2AErrorCodes.TASK_NOT_FOUND, message: 'Task not found' },
      });
      return;
    }
    this.pushConfigs.delete(taskId);
    this.sendJson(res, 200, { success: true });
  }

  // ─── Message Processing ────────────────────────────────

  private processMessage(request: SendMessageRequest): { task: Task } {
    const inputText = this.extractText(request.message);
    const responseText = this.generateResponse(inputText);

    // Multi-turn: if taskId matches an existing task, continue it
    const existingTaskId = request.message.taskId;
    if (existingTaskId && this.tasks.has(existingTaskId)) {
      const stored = this.tasks.get(existingTaskId)!;
      const task = stored.task;

      // Append to history
      if (!task.history) task.history = [];
      task.history.push(request.message);

      const agentMessage: Message = {
        messageId: crypto.randomUUID(),
        role: Role.AGENT,
        parts: [{ text: responseText }],
      };
      task.history.push(agentMessage);

      // Update status and artifact
      task.status = {
        state: TaskState.COMPLETED,
        message: agentMessage,
        timestamp: new Date().toISOString(),
      };
      task.artifacts = [{
        artifactId: crypto.randomUUID(),
        parts: [{ text: responseText }],
      }];

      return { task };
    }

    const taskId = existingTaskId || crypto.randomUUID();
    const contextId = request.message.contextId || crypto.randomUUID();

    const artifact: Artifact = {
      artifactId: crypto.randomUUID(),
      parts: [{ text: responseText }],
    };

    const agentMessage: Message = {
      messageId: crypto.randomUUID(),
      role: Role.AGENT,
      parts: [{ text: responseText }],
    };

    const task: Task = {
      id: taskId,
      contextId,
      status: {
        state: TaskState.COMPLETED,
        message: agentMessage,
        timestamp: new Date().toISOString(),
      },
      artifacts: [artifact],
      history: [request.message, agentMessage],
    };

    this.tasks.set(taskId, { task, createdAt: Date.now() });

    // Store push notification config if provided inline
    if (request.configuration?.taskPushNotificationConfig) {
      this.pushConfigs.set(taskId, request.configuration.taskPushNotificationConfig);
    }

    return { task };
  }

  private generateResponse(input: string): string {
    const lower = input.toLowerCase().trim();

    if (lower.includes('greet') || lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
      const greetings = [
        'Hello! I\'m the Overture Mock Agent. How can I help you today?',
        'Hi there! Welcome to A2A Overture. I\'m a mock agent ready for testing.',
        'Greetings! I\'m here to help you test your A2A integration.',
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }

    if (lower.includes('what can you do') || lower.includes('capabilities') || lower.includes('help')) {
      return 'I\'m a mock A2A agent with 3 skills:\n' +
        '1. Echo — I repeat back what you say\n' +
        '2. Greeting — I say hello\n' +
        '3. Long Task — I simulate multi-step processing\n\n' +
        'Try sending me any message!';
    }

    if (lower.includes('long task') || lower.includes('background') || lower.includes('process')) {
      return 'Simulated long task completed!\n' +
        'Step 1: Initialized... ✓\n' +
        'Step 2: Processing data... ✓\n' +
        'Step 3: Generating output... ✓\n' +
        'Step 4: Finalizing... ✓\n' +
        'All steps completed successfully.';
    }

    // Default: echo
    return `Mock echo: ${input}`;
  }

  private extractText(message: Message): string {
    for (const part of message.parts) {
      if (part.text) return part.text;
    }
    return '(no text content)';
  }

  // ─── Utilities ─────────────────────────────────────────

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'A2A-Version': '1.0' });
    res.end(JSON.stringify(data));
  }

  private sendJsonRpcError(res: http.ServerResponse, id: string | number, code: number, message: string) {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
    this.sendJson(res, 200, response);
  }

  private writeSSE(res: http.ServerResponse, data: unknown) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
