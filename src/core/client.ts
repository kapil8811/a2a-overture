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

// JSON-RPC method name mapping for v0.3.x agents (Python SDK convention)
const V03_METHOD_NAMES: Record<string, string> = {
  'SendMessage': 'message/send',
  'SendStreamingMessage': 'message/stream',
  'GetTask': 'tasks/get',
  'CancelTask': 'tasks/cancel',
  'SubscribeToTask': 'tasks/resubscribe',
  'SetPushNotificationConfig': 'tasks/pushNotificationConfig/set',
  'GetPushNotificationConfig': 'tasks/pushNotificationConfig/get',
  'DeletePushNotificationConfig': 'tasks/pushNotificationConfig/delete',
  'GetExtendedAgentCard': 'agent/getAuthenticatedExtendedCard',
};

export interface ClientOptions {
  /** Base URL of the A2A agent */
  baseUrl: string;
  /** Protocol binding to use */
  binding: 'HTTP+JSON' | 'JSONRPC';
  /** A2A protocol version */
  protocolVersion?: string;
  /** Detected agent protocol version (for method name compatibility) */
  agentProtocolVersion?: string;
  /** Authorization header value (e.g., "Bearer <token>") */
  authorization?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export class A2AClient {
  private options: Required<ClientOptions>;
  /** Separate RPC URL for JSON-RPC calls (may differ from baseUrl when agent serves at subpath) */
  private rpcUrl: string;

  constructor(options: ClientOptions) {
    this.options = {
      protocolVersion: '1.0',
      agentProtocolVersion: '',
      authorization: '',
      timeout: 30000,
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
    };
    this.rpcUrl = this.options.baseUrl;
  }

  /** Update the detected agent protocol version for method name compatibility */
  setAgentProtocolVersion(version: string): void {
    this.options.agentProtocolVersion = version;
  }

  /** Set the RPC endpoint URL (e.g., when agent card specifies a subpath like /a2a/v1) */
  setRpcUrl(url: string): void {
    this.rpcUrl = url.replace(/\/+$/, '');
  }

  /** Switch the protocol binding */
  setBinding(binding: 'HTTP+JSON' | 'JSONRPC'): void {
    this.options.binding = binding;
  }

  /** Get the current protocol binding */
  getBinding(): 'HTTP+JSON' | 'JSONRPC' {
    return this.options.binding;
  }

  /** Resolve the JSON-RPC method name based on detected agent protocol version */
  private resolveMethodName(method: string): string {
    const agentVersion = this.options.agentProtocolVersion;
    if (agentVersion && agentVersion.startsWith('0.')) {
      return V03_METHOD_NAMES[method] || method;
    }
    return method;
  }

  /** Transform params for pre-v1.0 compatibility (role values, part discriminators, etc.) */
  private transformParamsForAgent(params: Record<string, unknown>): Record<string, unknown> {
    const agentVersion = this.options.agentProtocolVersion;
    if (!agentVersion || !agentVersion.startsWith('0.')) {
      return params;
    }
    // Deep clone and transform
    const clone = JSON.parse(JSON.stringify(params), (_key, value) => {
      // Transform role values: ROLE_USER -> user, ROLE_AGENT -> agent
      if (value === 'ROLE_USER') return 'user';
      if (value === 'ROLE_AGENT') return 'agent';
      return value;
    });
    // Add 'kind' discriminator to parts (required by v0.2.x/.NET and v0.3.x agents)
    this.addPartKindDiscriminator(clone);
    return clone;
  }

  /** Recursively add 'kind' discriminator to Part objects missing it */
  private addPartKindDiscriminator(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) this.addPartKindDiscriminator(item);
      return;
    }
    const record = obj as Record<string, unknown>;
    // Detect part-like objects in a 'parts' array
    // .NET System.Text.Json requires the discriminator ('kind') to be the FIRST property
    if (Array.isArray(record.parts)) {
      const parts = record.parts as Record<string, unknown>[];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part && typeof part === 'object' && !part.kind) {
          let kind: string | undefined;
          if (part.text !== undefined) kind = 'text';
          else if (part.data !== undefined) kind = 'data';
          else if (part.raw !== undefined || part.url !== undefined) kind = 'file';
          if (kind) {
            // Rebuild object with 'kind' first so it serialises as the first JSON key
            parts[i] = { kind, ...part };
          }
        }
      }
    }
    // Recurse into nested objects
    for (const val of Object.values(record)) {
      if (val && typeof val === 'object') this.addPartKindDiscriminator(val);
    }
  }

  // ─── Agent Discovery ────────────────────────────────────

  async discoverAgentCard(wellKnownUrl?: string): Promise<AgentCard> {
    if (wellKnownUrl) {
      return this.fetch(wellKnownUrl, { method: 'GET' }) as Promise<AgentCard>;
    }
    // Try the v1.0 well-known URL first, then fall back to the older path
    const base = this.options.baseUrl;
    try {
      return await this.fetch(`${base}/.well-known/agent-card.json`, { method: 'GET' }) as Promise<AgentCard>;
    } catch {
      return this.fetch(`${base}/.well-known/agent.json`, { method: 'GET' }) as Promise<AgentCard>;
    }
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
      ? this.rpcUrl
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
      ? this.rpcUrl
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
      method: this.resolveMethodName(method),
      params: this.transformParamsForAgent(params),
    };
  }

  private async jsonRpcCall(method: string, params: Record<string, unknown>): Promise<unknown> {
    const request = this.buildJsonRpcRequest(method, params);
    const response = await this.rawFetch(this.rpcUrl, {
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
