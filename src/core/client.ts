import {
  AgentCard,
  SendMessageRequest,
  SendMessageResponse,
  Task,
  ListTasksRequest,
  ListTasksResponse,
  StreamResponse,
  JsonRpcRequest,
  JsonRpcResponse,
  Message,
  Role,
  Part,
  PushNotificationConfig,
} from './types';

export interface ClientOptions {
  /** Base URL of the A2A agent */
  baseUrl: string;
  /** Protocol binding to use */
  binding: 'HTTP+JSON' | 'JSONRPC';
  /** A2A protocol version */
  protocolVersion?: string;
  /** Authorization header value (e.g., "Bearer <token>") */
  authorization?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export class A2AClient {
  private readonly options: Required<ClientOptions>;

  constructor(options: ClientOptions) {
    this.options = {
      protocolVersion: '1.0',
      authorization: '',
      timeout: 30000,
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
    };
  }

  // ─── Agent Discovery ────────────────────────────────────

  async discoverAgentCard(wellKnownUrl?: string): Promise<AgentCard> {
    const url = wellKnownUrl || `${this.options.baseUrl}/.well-known/agent-card.json`;
    const res = await this.fetch(url, { method: 'GET' });
    return res as AgentCard;
  }

  async getExtendedAgentCard(): Promise<AgentCard> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('GetExtendedAgentCard', {}) as Promise<AgentCard>;
    }
    return this.fetch(`${this.options.baseUrl}/extendedAgentCard`, { method: 'GET' }) as Promise<AgentCard>;
  }

  // ─── Messaging ──────────────────────────────────────────

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('SendMessage', request as unknown as Record<string, unknown>) as Promise<SendMessageResponse>;
    }
    return this.fetch(`${this.options.baseUrl}/message:send`, {
      method: 'POST',
      body: request,
    }) as Promise<SendMessageResponse>;
  }

  async *streamMessage(request: SendMessageRequest): AsyncGenerator<StreamResponse> {
    const url = this.options.binding === 'JSONRPC'
      ? this.options.baseUrl
      : `${this.options.baseUrl}/message:stream`;

    const body = this.options.binding === 'JSONRPC'
      ? this.buildJsonRpcRequest('SendStreamingMessage', request as unknown as Record<string, unknown>)
      : request;

    const response = await this.rawFetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body for stream');
    }

    yield* this.parseSSEStream(response);
  }

  // ─── Task Management ───────────────────────────────────

  async getTask(taskId: string, historyLength?: number): Promise<Task> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('GetTask', { id: taskId, historyLength }) as Promise<Task>;
    }
    const params = historyLength !== undefined ? `?historyLength=${historyLength}` : '';
    return this.fetch(`${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}${params}`, {
      method: 'GET',
    }) as Promise<Task>;
  }

  async listTasks(request?: ListTasksRequest): Promise<ListTasksResponse> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('ListTasks', (request ?? {}) as Record<string, unknown>) as Promise<ListTasksResponse>;
    }
    const params = new URLSearchParams();
    if (request?.contextId) params.set('contextId', request.contextId);
    if (request?.status) params.set('status', request.status);
    if (request?.pageSize) params.set('pageSize', String(request.pageSize));
    if (request?.pageToken) params.set('pageToken', request.pageToken);
    if (request?.historyLength !== undefined) params.set('historyLength', String(request.historyLength));
    if (request?.includeArtifacts) params.set('includeArtifacts', 'true');

    const qs = params.toString();
    return this.fetch(`${this.options.baseUrl}/tasks${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    }) as Promise<ListTasksResponse>;
  }

  async cancelTask(taskId: string): Promise<Task> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('CancelTask', { id: taskId }) as Promise<Task>;
    }
    return this.fetch(`${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}:cancel`, {
      method: 'POST',
    }) as Promise<Task>;
  }

  // ─── Subscribe to Task (SSE) ────────────────────────────

  async *subscribeToTask(taskId: string): AsyncGenerator<StreamResponse> {
    const url = this.options.binding === 'JSONRPC'
      ? this.options.baseUrl
      : `${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}:subscribe`;

    const body = this.options.binding === 'JSONRPC'
      ? this.buildJsonRpcRequest('SubscribeToTask', { id: taskId })
      : { id: taskId };

    const response = await this.rawFetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new A2AError(`Subscribe request failed: ${response.status} ${response.statusText}`, response.status);
    }

    if (!response.body) {
      throw new Error('No response body for subscribe stream');
    }

    yield* this.parseSSEStream(response);
  }

  // ─── Push Notification Config CRUD ──────────────────────

  async setPushNotificationConfig(taskId: string, config: PushNotificationConfig): Promise<PushNotificationConfig> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('SetPushNotificationConfig', { taskId, pushNotificationConfig: config }) as Promise<PushNotificationConfig>;
    }
    return this.fetch(`${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}/pushNotificationConfig`, {
      method: 'POST',
      body: { taskId, pushNotificationConfig: config },
    }) as Promise<PushNotificationConfig>;
  }

  async getPushNotificationConfig(taskId: string): Promise<PushNotificationConfig> {
    if (this.options.binding === 'JSONRPC') {
      return this.jsonRpcCall('GetPushNotificationConfig', { taskId }) as Promise<PushNotificationConfig>;
    }
    return this.fetch(`${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}/pushNotificationConfig`, {
      method: 'GET',
    }) as Promise<PushNotificationConfig>;
  }

  async deletePushNotificationConfig(taskId: string): Promise<void> {
    if (this.options.binding === 'JSONRPC') {
      await this.jsonRpcCall('DeletePushNotificationConfig', { taskId });
      return;
    }
    await this.fetch(`${this.options.baseUrl}/tasks/${encodeURIComponent(taskId)}/pushNotificationConfig`, {
      method: 'DELETE',
    });
  }

  // ─── Utility: Quick send a text message ─────────────────

  createTextMessage(text: string, taskId?: string, contextId?: string): SendMessageRequest {
    const message: Message = {
      messageId: crypto.randomUUID(),
      role: Role.USER,
      parts: [{ text }],
      ...(taskId && { taskId }),
      ...(contextId && { contextId }),
    };
    return { message };
  }

  // ─── Internals ──────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'A2A-Version': this.options.protocolVersion,
    };
    if (this.options.authorization) {
      headers['Authorization'] = this.options.authorization;
    }
    return headers;
  }

  private buildJsonRpcRequest(method: string, params: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params,
    };
  }

  private async jsonRpcCall(method: string, params: Record<string, unknown>): Promise<unknown> {
    const request = this.buildJsonRpcRequest(method, params);
    const response = await this.rawFetch(this.options.baseUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
    });

    const json = await response.json() as JsonRpcResponse;

    if ('error' in json) {
      throw new A2AError(json.error.message, json.error.code, json.error.data);
    }

    return json.result;
  }

  private async fetch(url: string, init: { method: string; body?: unknown }): Promise<unknown> {
    const headers = this.buildHeaders();
    if (init.method === 'GET') {
      delete (headers as Record<string, string>)['Content-Type'];
    }

    const response = await this.rawFetch(url, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new A2AError(`HTTP ${response.status}: ${text}`, response.status);
    }

    return response.json();
  }

  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async *parseSSEStream(response: Response): AsyncGenerator<StreamResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data) {
              try {
                const parsed = JSON.parse(data);
                // For JSON-RPC binding, extract result
                const event = parsed.result ? parsed.result : parsed;
                yield event as StreamResponse;
              } catch {
                // Skip malformed SSE data
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export class A2AError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'A2AError';
  }
}
