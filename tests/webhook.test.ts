import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as http from 'http';
import { MockA2AServer } from '../src/mock/server';
import { A2AClient } from '../src/core/client';

describe('Mock server webhook delivery', () => {
  let mockServer: MockA2AServer;
  let webhookServer: http.Server;
  let webhookPayloads: Array<{ body: any; headers: http.IncomingHttpHeaders }>;
  const MOCK_PORT = 13001;
  const WEBHOOK_PORT = 13002;

  beforeAll(async () => {
    // Start the mock A2A server
    mockServer = new MockA2AServer({ port: MOCK_PORT });
    await mockServer.start();

    // Start a webhook receiver
    webhookPayloads = [];
    webhookServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          webhookPayloads.push({ body, headers: req.headers });
        } catch {
          webhookPayloads.push({ body: null, headers: req.headers });
        }
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      webhookServer.listen(WEBHOOK_PORT, 'localhost', () => resolve());
    });
  });

  afterEach(() => {
    webhookPayloads = [];
  });

  afterAll(async () => {
    await mockServer.stop();
    await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  });

  it('should deliver webhook when push config is set and task completes', async () => {
    const client = new A2AClient({ baseUrl: `http://localhost:${MOCK_PORT}`, binding: 'HTTP+JSON' });

    // Create a task
    const request = client.createTextMessage('Webhook test message');
    const response = await client.sendMessage(request);
    const task = (response as any).task;
    expect(task).toBeDefined();
    expect(task.id).toBeTruthy();

    // Set push notification config pointing to our webhook receiver
    await client.setPushNotificationConfig(task.id, {
      url: `http://localhost:${WEBHOOK_PORT}/webhook`,
      token: 'test-webhook-token',
    });

    // Send another message to the same task (triggers webhook delivery)
    const followUp = client.createTextMessage('Follow-up for webhook test', task.id);
    await client.sendMessage(followUp);

    // Give webhook delivery a moment (it's async fire-and-forget)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify webhook was received
    expect(webhookPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = webhookPayloads[webhookPayloads.length - 1];
    expect(lastPayload.body.taskId).toBe(task.id);
    expect(lastPayload.body.status).toBeDefined();
    expect(lastPayload.body.status.state).toBe('TASK_STATE_COMPLETED');
    expect(lastPayload.headers['authorization']).toBe('Bearer test-webhook-token');
    expect(lastPayload.headers['content-type']).toBe('application/json');
  });

  it('should deliver webhook on task cancellation', async () => {
    const client = new A2AClient({ baseUrl: `http://localhost:${MOCK_PORT}`, binding: 'HTTP+JSON' });

    // Create a task
    const request = client.createTextMessage('Cancel webhook test');
    const response = await client.sendMessage(request);
    const task = (response as any).task;

    // Set push notification config
    await client.setPushNotificationConfig(task.id, {
      url: `http://localhost:${WEBHOOK_PORT}/cancel-webhook`,
    });

    // Cancel the task
    await client.cancelTask(task.id);

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(webhookPayloads.length).toBeGreaterThanOrEqual(1);
    const cancelPayload = webhookPayloads.find(p => p.body?.status?.state === 'TASK_STATE_CANCELED');
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.body.taskId).toBe(task.id);
  });

  it('should include authentication header from push config', async () => {
    const client = new A2AClient({ baseUrl: `http://localhost:${MOCK_PORT}`, binding: 'HTTP+JSON' });

    // Create a task
    const request = client.createTextMessage('Auth webhook test');
    const response = await client.sendMessage(request);
    const task = (response as any).task;

    // Set push config with custom auth scheme
    await client.setPushNotificationConfig(task.id, {
      url: `http://localhost:${WEBHOOK_PORT}/auth-webhook`,
      authentication: { scheme: 'ApiKey', credentials: 'my-secret-key' },
    });

    // Trigger a task update
    const followUp = client.createTextMessage('Trigger webhook', task.id);
    await client.sendMessage(followUp);

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(webhookPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = webhookPayloads[webhookPayloads.length - 1];
    expect(lastPayload.headers['authorization']).toBe('ApiKey my-secret-key');
  });

  it('should not fail when webhook URL is unreachable', async () => {
    const client = new A2AClient({ baseUrl: `http://localhost:${MOCK_PORT}`, binding: 'HTTP+JSON' });

    // Create a task
    const request = client.createTextMessage('Unreachable webhook test');
    const response = await client.sendMessage(request);
    const task = (response as any).task;

    // Set push config pointing to a non-existent server
    await client.setPushNotificationConfig(task.id, {
      url: 'http://localhost:19999/nonexistent',
    });

    // This should not throw — webhook delivery is best-effort
    const followUp = client.createTextMessage('Should not fail', task.id);
    const result = await client.sendMessage(followUp);
    expect((result as any).task).toBeDefined();
  });
});

describe('Mock server JSON-RPC webhook delivery', () => {
  let mockServer: MockA2AServer;
  let webhookServer: http.Server;
  let webhookPayloads: Array<{ body: any; headers: http.IncomingHttpHeaders }>;
  const MOCK_PORT = 13003;
  const WEBHOOK_PORT = 13004;

  beforeAll(async () => {
    mockServer = new MockA2AServer({ port: MOCK_PORT });
    await mockServer.start();

    webhookPayloads = [];
    webhookServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          webhookPayloads.push({ body, headers: req.headers });
        } catch {
          webhookPayloads.push({ body: null, headers: req.headers });
        }
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      webhookServer.listen(WEBHOOK_PORT, 'localhost', () => resolve());
    });
  });

  afterEach(() => {
    webhookPayloads = [];
  });

  afterAll(async () => {
    await mockServer.stop();
    await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  });

  it('should deliver webhook on JSON-RPC CancelTask', async () => {
    const client = new A2AClient({ baseUrl: `http://localhost:${MOCK_PORT}`, binding: 'JSONRPC' });

    // Create a task via JSON-RPC
    const request = client.createTextMessage('JSON-RPC cancel webhook test');
    const response = await client.sendMessage(request);
    const task = (response as any);
    const taskId = task.task?.id || task.id;
    expect(taskId).toBeTruthy();

    // Set push config via JSON-RPC
    await client.setPushNotificationConfig(taskId, {
      url: `http://localhost:${WEBHOOK_PORT}/jsonrpc-webhook`,
      token: 'jsonrpc-token',
    });

    // Cancel via JSON-RPC
    await client.cancelTask(taskId);

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(webhookPayloads.length).toBeGreaterThanOrEqual(1);
    const cancelPayload = webhookPayloads.find(p => p.body?.status?.state === 'TASK_STATE_CANCELED');
    expect(cancelPayload).toBeDefined();
  });
});
