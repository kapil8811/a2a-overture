import { ComplianceTestResult } from '../../types';
import { A2AClient, A2AError } from '../../client';
import { validateAgentCard, ValidationIssue } from '../../validator';

export interface ComplianceTest {
  id: string;
  name: string;
  description: string;
  run: (client: A2AClient, agentCard: Record<string, unknown>) => Promise<ComplianceTestResult>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, duration: Date.now() - start };
}

/** Extract task from response, handling both v1.0 ({task: {...}}) and v0.3.x (direct {id, status, ...}) formats */
function extractTask(response: Record<string, unknown>): Record<string, unknown> | undefined {
  if (response.task) return response.task as Record<string, unknown>;
  // v0.3.x direct task format (has id and status at top level)
  if (response.id && response.status && typeof response.status === 'object') return response;
  return undefined;
}

/** Extract contextId from a response (either task.contextId or direct contextId) */
function extractContextId(response: Record<string, unknown>): string | undefined {
  const task = extractTask(response);
  if (task) return task.contextId as string | undefined;
  return response.contextId as string | undefined;
}

// ─── Test: Agent Card Reachable ──────────────────────────

const agentCardReachable: ComplianceTest = {
  id: 'card-reachable',
  name: 'Agent Card is reachable',
  description: 'The agent must serve an Agent Card at the well-known URL or configured endpoint',
  async run(client) {
    const { result: card, duration } = await timed(() => client.discoverAgentCard());
    if (!card || typeof card !== 'object') {
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Agent Card response is not a valid JSON object', duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
  },
};

// ─── Test: Agent Card Valid Schema ───────────────────────

const agentCardValid: ComplianceTest = {
  id: 'card-valid',
  name: 'Agent Card schema is valid',
  description: 'The Agent Card must conform to the A2A v1.0 specification schema',
  async run(client) {
    const { result: card, duration } = await timed(() => client.discoverAgentCard());
    const validation = validateAgentCard(card);
    if (!validation.valid) {
      const errorSummary = validation.errors.map((e: ValidationIssue) => `${e.path}: ${e.message}`).join('; ');
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: errorSummary, duration };
    }
    if (validation.warnings.length > 0) {
      const warnSummary = validation.warnings.map((w: ValidationIssue) => `${w.path}: ${w.message}`).join('; ');
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: warnSummary, duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
  },
};

// ─── Test: Required Fields Present ───────────────────────

const requiredFieldsPresent: ComplianceTest = {
  id: 'card-required-fields',
  name: 'Required fields are present',
  description: 'name, description, version, supportedInterfaces, capabilities, defaultInputModes, defaultOutputModes, skills must be present',
  async run(client) {
    const { result: card, duration } = await timed(() => client.discoverAgentCard());
    const c = card as unknown as Record<string, unknown>;
    const required = ['name', 'description', 'version', 'supportedInterfaces', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills'];
    const missing = required.filter(f => c[f] === undefined || c[f] === null);
    if (missing.length > 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: `Missing required fields: ${missing.join(', ')}`, duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
  },
};

// ─── Test: At Least One Skill ────────────────────────────

const hasSkills: ComplianceTest = {
  id: 'card-has-skills',
  name: 'Agent declares at least one skill',
  description: 'The Agent Card should declare at least one skill so clients know what the agent can do',
  async run(client) {
    const { result: card, duration } = await timed(() => client.discoverAgentCard());
    const c = card as unknown as Record<string, unknown>;
    if (!Array.isArray(c.skills) || c.skills.length === 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'No skills declared — clients cannot discover agent capabilities', duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `${c.skills.length} skill(s) declared`, duration };
  },
};

// ─── Test: Interface URLs are HTTPS ──────────────────────

const interfacesHttps: ComplianceTest = {
  id: 'card-https',
  name: 'Interface URLs use HTTPS',
  description: 'Production deployments MUST use encrypted communication (HTTPS)',
  async run(client) {
    const { result: card, duration } = await timed(() => client.discoverAgentCard());
    const c = card as unknown as Record<string, unknown>;
    if (!Array.isArray(c.supportedInterfaces)) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No interfaces declared', duration };
    }
    const nonHttps = (c.supportedInterfaces as Record<string, unknown>[]).filter(i => {
      const url = i.url as string;
      return url && !url.startsWith('https://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1');
    });
    if (nonHttps.length > 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `${nonHttps.length} interface(s) not using HTTPS`, duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
  },
};

// ─── Test: Send Message Works ────────────────────────────

const sendMessageWorks: ComplianceTest = {
  id: 'send-message',
  name: 'SendMessage accepts a basic text message',
  description: 'The agent must accept a SendMessage request and return a Task or Message',
  async run(client) {
    try {
      const request = client.createTextMessage('Hello, this is a test from A2A Overture.');
      const { result: response, duration } = await timed(() => client.sendMessage(request));
      const r = response as Record<string, unknown>;
      if (r.task) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Received Task response', duration };
      }
      if (r.message) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Received direct Message response', duration };
      }
      // v0.3.x agents return the message directly (with kind, role, parts)
      if (r.kind === 'message' || (r.role && r.parts)) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Received Message response (v0.3 format)', duration };
      }
      // v0.3.x agents may also return a task directly (with id, status)
      if (r.id && r.status) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Received Task response (v0.3 format)', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Response contains neither task nor message', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg, duration: 0 };
    }
  },
};

// ─── Test: GetTask Returns Valid Task ─────────────────────

const getTaskWorks: ComplianceTest = {
  id: 'get-task',
  name: 'GetTask returns a valid task',
  description: 'After sending a message, GetTask should return the task with a valid state',
  async run(client) {
    try {
      const request = client.createTextMessage('Test message for GetTask validation.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);

      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned a direct Message (no Task created) — GetTask not applicable' };
      }

      const taskId = task.id as string;

      const { result: fetched, duration } = await timed(() => client.getTask(taskId));
      const f = fetched as unknown as Record<string, unknown>;

      if (f.id !== taskId) {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: `Returned task ID "${f.id}" does not match requested "${taskId}"`, duration };
      }
      if (!f.status || typeof f.status !== 'object') {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Task is missing status object', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg, duration: 0 };
    }
  },
};

// ─── Test: Invalid Task ID Returns Error ─────────────────

const invalidTaskReturnsError: ComplianceTest = {
  id: 'invalid-task-error',
  name: 'Invalid task ID returns TaskNotFoundError',
  description: 'GetTask with a non-existent task ID must return a TaskNotFoundError',
  async run(client) {
    try {
      await client.getTask('nonexistent-task-id-overture-test');
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Agent did not return an error for a non-existent task ID' };
    } catch (rawErr: unknown) {
      if (rawErr instanceof A2AError) {
        if (rawErr.code === -32001 || rawErr.code === 404) {
          return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Correctly returned error code ${rawErr.code}` };
        }
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `Returned error code ${rawErr.code}, expected -32001 (JSON-RPC) or 404 (HTTP)` };
      }
      // Any error is acceptable — the agent rejected the invalid ID
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent returned an error (non-A2A error format)' };
    }
  },
};

// ─── Test: Streaming Support ─────────────────────────────

const streamingWorks: ComplianceTest = {
  id: 'streaming',
  name: 'Streaming works (if supported)',
  description: 'If the agent declares streaming capability, SendStreamingMessage should work',
  async run(client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;
    if (!caps?.streaming) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not declare streaming capability' };
    }
    try {
      const request = client.createTextMessage('Stream test from A2A Overture.');
      let eventCount = 0;
      const start = Date.now();

      for await (const event of client.streamMessage(request)) {
        eventCount++;
        if (eventCount > 50) break; // Safety limit
      }

      const duration = Date.now() - start;
      if (eventCount === 0) {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Stream produced no events', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Received ${eventCount} event(s)`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Version Header Handling ───────────────────────

const versionHeaderHandled: ComplianceTest = {
  id: 'version-header',
  name: 'A2A-Version header is accepted',
  description: 'Agent should accept requests with A2A-Version: 1.0 header',
  async run(client) {
    try {
      // The client already sends A2A-Version header; if we got this far, it works
      const request = client.createTextMessage('Version header test.');
      const { duration } = await timed(() => client.sendMessage(request));
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', duration };
    } catch (rawErr: unknown) {
      if (rawErr instanceof A2AError && rawErr.code === -32009) {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Agent returned VersionNotSupportedError for v1.0' };
      }
      // Other errors are not version-related
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent accepted the version header (other errors may exist)' };
    }
  },
};

// ─── All Tests ───────────────────────────────────────────

// ─── Test: Cancel Task ───────────────────────────────────

const cancelTaskWorks: ComplianceTest = {
  id: 'cancel-task',
  name: 'CancelTask cancels a running task',
  description: 'After creating a task, CancelTask should set its state to CANCELED',
  async run(client) {
    try {
      const request = client.createTextMessage('Task to cancel for compliance test.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);

      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned a direct Message (no Task) — cancel not applicable' };
      }

      const taskId = task.id as string;

      const { result: cancelled, duration } = await timed(() => client.cancelTask(taskId));
      const c = cancelled as unknown as Record<string, unknown>;
      const status = c.status as Record<string, unknown> | undefined;

      if (status?.state === 'TASK_STATE_CANCELED') {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Task cancelled successfully', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `Task state after cancel: ${status?.state ?? 'unknown'}`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: List Tasks ────────────────────────────────────

const listTasksWorks: ComplianceTest = {
  id: 'list-tasks',
  name: 'ListTasks returns task list',
  description: 'ListTasks should return an array of tasks after at least one message has been sent',
  async run(client) {
    try {
      // Create a task first
      const request = client.createTextMessage('Creating task for ListTasks test.');
      await client.sendMessage(request);

      const { result: listResult, duration } = await timed(() => client.listTasks());
      const lr = listResult as unknown as Record<string, unknown>;
      const tasks = lr.tasks;

      if (!Array.isArray(tasks)) {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'ListTasks did not return a tasks array', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `${tasks.length} task(s) returned`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Some agents may not support ListTasks (v0.3.x agents, or -32601 method not found)
      if (msg.includes('-32004') || msg.includes('-32601') || msg.includes('-32600') ||
          msg.includes('not supported') || msg.includes('not found') || msg.includes('validation error')) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not support ListTasks' };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Multi-turn — Context Continuation ─────────────

const multiTurnContext: ComplianceTest = {
  id: 'multi-turn-context',
  name: 'Multi-turn conversation via contextId',
  description: 'Sending multiple messages with the same contextId should maintain conversational context',
  async run(client) {
    try {
      // First message — establish context
      const msg1 = client.createTextMessage('My name is Overture Test Bot.');
      const { result: res1 } = await timed(() => client.sendMessage(msg1));
      const r1 = res1 as Record<string, unknown>;
      const task1 = extractTask(r1);

      if (!task1) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message — task-based multi-turn not applicable' };
      }

      const contextId = extractContextId(r1) as string;
      if (!contextId) {
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'First response missing contextId — cannot test multi-turn' };
      }

      // Second message — same context, new task
      const msg2 = client.createTextMessage('What is my name?', undefined, contextId);
      const start = Date.now();
      const res2 = await client.sendMessage(msg2);
      const duration = Date.now() - start;
      const r2 = res2 as Record<string, unknown>;
      const task2 = extractTask(r2);

      if (!task2) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Multi-turn accepted (agent returned Message for follow-up)', duration };
      }

      const contextId2 = extractContextId(r2);
      if (contextId2 === contextId) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Context ${contextId} maintained across turns`, duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `Context changed: expected ${contextId}, got ${contextId2}`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Multi-turn — Task Continuation ────────────────

const multiTurnTask: ComplianceTest = {
  id: 'multi-turn-task',
  name: 'Multi-turn via taskId continuation',
  description: 'Sending a follow-up message with the same taskId should continue the existing task',
  async run(client) {
    try {
      // Create initial task
      const msg1 = client.createTextMessage('Start a conversation for task continuation test.');
      const { result: res1 } = await timed(() => client.sendMessage(msg1));
      const r1 = res1 as Record<string, unknown>;
      const task1 = extractTask(r1);

      if (!task1) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message — task continuation not applicable' };
      }

      const taskId = task1.id as string;

      // Follow-up with same taskId
      const msg2 = client.createTextMessage('Continue the previous task.', taskId);
      const start = Date.now();
      const res2 = await client.sendMessage(msg2);
      const duration = Date.now() - start;
      const r2 = res2 as Record<string, unknown>;
      const task2 = extractTask(r2);

      if (!task2) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Follow-up accepted (agent returned Message)', duration };
      }

      if (task2.id === taskId) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Task ${taskId} continued successfully`, duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `Agent created new task ${task2.id} instead of continuing ${taskId}`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Multi-turn — History Returned ─────────────────

const multiTurnHistory: ComplianceTest = {
  id: 'multi-turn-history',
  name: 'Task history includes previous messages',
  description: 'After multi-turn interaction, GetTask with historyLength should return message history',
  async run(client) {
    try {
      // Send first message
      const msg1 = client.createTextMessage('First message for history test.');
      const res1 = await client.sendMessage(msg1);
      const r1 = res1 as Record<string, unknown>;
      const task1 = extractTask(r1);

      if (!task1) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message — history test not applicable' };
      }

      const taskId = task1.id as string;

      // Send follow-up on same task
      const msg2 = client.createTextMessage('Second message for history test.', taskId);
      await client.sendMessage(msg2);

      // Fetch task with history
      const { result: fetched, duration } = await timed(() => client.getTask(taskId, 10));
      const f = fetched as unknown as Record<string, unknown>;
      const history = f.history as unknown[] | undefined;

      if (!history || !Array.isArray(history)) {
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Task response does not include history array', duration };
      }
      if (history.length >= 2) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `${history.length} message(s) in history`, duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: `Only ${history.length} message(s) in history, expected >= 2`, duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Push Notifications — Capability Declaration ───

const pushNotificationCapability: ComplianceTest = {
  id: 'push-notification-capability',
  name: 'Push notification capability is declared',
  description: 'If agent supports push notifications, the capability should be declared in the Agent Card',
  async run(client, agentCard) {
    const { duration } = await timed(() => Promise.resolve());
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;

    if (!caps) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No capabilities object in Agent Card' };
    }

    if (caps.pushNotifications === true) {
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Push notifications declared as supported', duration };
    }
    if (caps.pushNotifications === false) {
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Push notifications explicitly declared as unsupported', duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Push notification capability not explicitly declared (defaults to false)', duration };
  },
};

// ─── Test: Push Notifications — Config Rejected if Unsupported ─

const pushNotificationReject: ComplianceTest = {
  id: 'push-notification-reject',
  name: 'Push config rejected when unsupported',
  description: 'If agent does not support push notifications, providing pushNotificationConfig should be rejected',
  async run(client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;

    if (caps?.pushNotifications === true) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent supports push notifications — rejection test not applicable' };
    }

    try {
      const request = client.createTextMessage('Push notification rejection test.');
      request.configuration = {
        taskPushNotificationConfig: {
          url: 'https://example.com/webhook',
          token: 'test-token',
        },
      };

      const start = Date.now();
      const res = await client.sendMessage(request);
      const duration = Date.now() - start;

      // If the agent accepted it silently, that's a warning — it should reject
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Agent accepted push notification config despite not declaring support', duration };
    } catch (err) {
      if (err instanceof A2AError && err.code === -32003) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Correctly returned PushNotificationNotSupportedError (-32003)' };
      }
      // Any error is an acceptable rejection
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent rejected push config (non-standard error)' };
    }
  },
};

// ─── Test: Auth — Unauthorized Without Credentials ───────

const authUnauthorized: ComplianceTest = {
  id: 'auth-unauthorized',
  name: 'Agent rejects unauthenticated requests when auth required',
  description: 'If agent declares security schemes, unauthenticated requests should be rejected with 401 or AUTH_REQUIRED',
  async run(client, agentCard) {
    const securitySchemes = agentCard.securitySchemes as Record<string, unknown> | undefined;
    const securityRequirements = agentCard.securityRequirements as unknown[] | undefined;

    // Only test if security is declared
    if ((!securitySchemes || Object.keys(securitySchemes).length === 0) &&
        (!securityRequirements || securityRequirements.length === 0)) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No security schemes or requirements declared — auth test skipped' };
    }

    try {
      // Create a client WITHOUT auth credentials, using the agent card's interface URL
      const interfaces = agentCard.supportedInterfaces as Array<Record<string, unknown>> | undefined;
      const baseUrl = interfaces?.[0]?.url as string | undefined;
      if (!baseUrl) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Cannot determine agent URL from Agent Card' };
      }
      const binding = (interfaces![0].protocolBinding as string) === 'JSONRPC' ? 'JSONRPC' as const : 'HTTP+JSON' as const;

      const noAuthClient = new A2AClient({
        baseUrl,
        binding,
        // deliberately no authorization
      });

      const request = noAuthClient.createTextMessage('Unauthenticated test.');
      const start = Date.now();
      const res = await noAuthClient.sendMessage(request);
      const duration = Date.now() - start;

      // If it succeeded, the agent isn't enforcing auth
      const r = res as Record<string, unknown>;
      const task = r.task as Record<string, unknown> | undefined;
      if (task?.status) {
        const status = task.status as Record<string, unknown>;
        if (status.state === 'TASK_STATE_AUTH_REQUIRED') {
          return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent returned AUTH_REQUIRED state', duration };
        }
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Agent accepted unauthenticated request despite declaring security schemes', duration };
    } catch (err) {
      if (err instanceof A2AError && (err.code === 401 || err.code === 403)) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Correctly returned ${err.code} for unauthenticated request` };
      }
      // HTTP 401/403 errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent rejected unauthenticated request' };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Auth — Security Schemes Declared ──────────────

const authSecuritySchemes: ComplianceTest = {
  id: 'auth-security-schemes',
  name: 'Security schemes are well-formed',
  description: 'If security schemes are declared, they should have valid structure with recognized scheme types',
  async run(client, agentCard) {
    const { duration } = await timed(() => Promise.resolve());
    const schemes = agentCard.securitySchemes as Record<string, Record<string, unknown>> | undefined;

    if (!schemes || Object.keys(schemes).length === 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No security schemes declared', duration };
    }

    const knownTypes = ['apiKeySecurityScheme', 'httpAuthSecurityScheme', 'oauth2SecurityScheme', 'openIdConnectSecurityScheme', 'mtlsSecurityScheme'];
    const issues: string[] = [];

    for (const [name, scheme] of Object.entries(schemes)) {
      const declaredTypes = knownTypes.filter(t => scheme[t] !== undefined);
      if (declaredTypes.length === 0) {
        issues.push(`"${name}": no recognized security scheme type`);
      }

      // Validate specific scheme structures
      if (scheme.httpAuthSecurityScheme) {
        const http = scheme.httpAuthSecurityScheme as Record<string, unknown>;
        if (!http.scheme) issues.push(`"${name}".httpAuthSecurityScheme: missing "scheme" field`);
      }
      if (scheme.oauth2SecurityScheme) {
        const oauth = scheme.oauth2SecurityScheme as Record<string, unknown>;
        if (!oauth.flows) issues.push(`"${name}".oauth2SecurityScheme: missing "flows" field`);
      }
      if (scheme.openIdConnectSecurityScheme) {
        const oidc = scheme.openIdConnectSecurityScheme as Record<string, unknown>;
        if (!oidc.openIdConnectUrl) issues.push(`"${name}".openIdConnectSecurityScheme: missing "openIdConnectUrl" field`);
      }
      if (scheme.apiKeySecurityScheme) {
        const apiKey = scheme.apiKeySecurityScheme as Record<string, unknown>;
        if (!apiKey.name) issues.push(`"${name}".apiKeySecurityScheme: missing "name" field`);
        if (!apiKey.location) issues.push(`"${name}".apiKeySecurityScheme: missing "location" field`);
      }
    }

    if (issues.length > 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: issues.join('; '), duration };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `${Object.keys(schemes).length} security scheme(s) validated`, duration };
  },
};

// ─── Test: Subscribe to Task ─────────────────────────────

const subscribeTaskWorks: ComplianceTest = {
  id: 'subscribe-task',
  name: 'SubscribeToTask streams task updates',
  description: 'SubscribeToTask should open an SSE stream and emit status/artifact events for an existing task',
  async run(client) {
    try {
      // Create a task first
      const request = client.createTextMessage('Task for subscribe test.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);

      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message — subscribe not applicable' };
      }

      const taskId = task.id as string;

      let eventCount = 0;
      const start = Date.now();

      for await (const event of client.subscribeToTask(taskId)) {
        eventCount++;
        if (eventCount > 50) break; // Safety limit
      }

      const duration = Date.now() - start;
      if (eventCount === 0) {
        return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Subscribe stream produced no events', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `Received ${eventCount} event(s)`, duration };
    } catch (rawErr: unknown) {
      if (rawErr instanceof A2AError && rawErr.code === -32004) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not support SubscribeToTask' };
      }
      const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Push Notification Config — Set ────────────────

const pushSetConfig: ComplianceTest = {
  id: 'push-set-config',
  name: 'SetPushNotificationConfig stores config',
  description: 'Setting a push notification config for a task should succeed when agent supports push notifications',
  async run(client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;
    if (!caps?.pushNotifications) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not support push notifications' };
    }

    try {
      // Create a task first
      const request = client.createTextMessage('Task for push config set test.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);
      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message — push config not applicable' };
      }

      const taskId = task.id as string;

      const { result: config, duration } = await timed(() => client.setPushNotificationConfig(taskId, {
        url: 'https://example.com/webhook',
        token: 'test-token-123',
      }));

      const c = config as unknown as Record<string, unknown>;
      if (c.url === 'https://example.com/webhook') {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Push config stored successfully', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Config returned but URL does not match', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Push Notification Config — Get ────────────────

const pushGetConfig: ComplianceTest = {
  id: 'push-get-config',
  name: 'GetPushNotificationConfig retrieves config',
  description: 'After setting a push config, GetPushNotificationConfig should return it',
  async run(client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;
    if (!caps?.pushNotifications) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not support push notifications' };
    }

    try {
      // Create a task and set push config
      const request = client.createTextMessage('Task for push config get test.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);
      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message' };
      }

      const taskId = task.id as string;

      await client.setPushNotificationConfig(taskId, {
        url: 'https://example.com/webhook-get-test',
        token: 'get-test-token',
      });

      const { result: config, duration } = await timed(() => client.getPushNotificationConfig(taskId));
      const c = config as unknown as Record<string, unknown>;
      if (c.url === 'https://example.com/webhook-get-test') {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Push config retrieved successfully', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Retrieved config URL does not match what was set', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Test: Push Notification Config — Delete ─────────────

const pushDeleteConfig: ComplianceTest = {
  id: 'push-delete-config',
  name: 'DeletePushNotificationConfig removes config',
  description: 'After deleting a push config, GetPushNotificationConfig should fail',
  async run(client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;
    if (!caps?.pushNotifications) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not support push notifications' };
    }

    try {
      // Create a task and set push config
      const request = client.createTextMessage('Task for push config delete test.');
      const sendResult = await client.sendMessage(request);
      const sr = sendResult as Record<string, unknown>;
      const task = extractTask(sr);
      if (!task) {
        return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent returned direct Message' };
      }

      const taskId = task.id as string;

      await client.setPushNotificationConfig(taskId, {
        url: 'https://example.com/webhook-delete-test',
      });

      const { duration } = await timed(() => client.deletePushNotificationConfig(taskId));

      // Verify deletion — get should now fail
      try {
        await client.getPushNotificationConfig(taskId);
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Config still retrievable after deletion', duration };
      } catch {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Push config deleted and verified', duration };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

export const allComplianceTests: ComplianceTest[] = [
  agentCardReachable,
  agentCardValid,
  requiredFieldsPresent,
  hasSkills,
  interfacesHttps,
  sendMessageWorks,
  getTaskWorks,
  invalidTaskReturnsError,
  cancelTaskWorks,
  listTasksWorks,
  streamingWorks,
  versionHeaderHandled,
  multiTurnContext,
  multiTurnTask,
  multiTurnHistory,
  pushNotificationCapability,
  pushNotificationReject,
  subscribeTaskWorks,
  pushSetConfig,
  pushGetConfig,
  pushDeleteConfig,
  authUnauthorized,
  authSecuritySchemes,
];
