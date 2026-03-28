import { A2AClient, ClientOptions } from '../client';
import { ComplianceTestResult } from '../types';

export interface InteropTestResult {
  agents: Array<{ url: string; name?: string }>;
  timestamp: string;
  duration: number;
  tests: ComplianceTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
}

export interface InteropOptions {
  /** Base ClientOptions applied to every agent */
  clientDefaults?: Partial<ClientOptions>;
  /** Progress callback */
  onTestComplete?: (result: ComplianceTestResult, index: number, total: number) => void;
}

interface AgentInfo {
  url: string;
  name?: string;
  client: A2AClient;
  card: Record<string, unknown>;
  binding: 'HTTP+JSON' | 'JSONRPC';
}

/**
 * Run multi-agent interop tests.
 * Checks that agents can discover each other, exchange messages,
 * and handle referenceTaskIds across agents.
 */
export async function runInteropSuite(
  agentUrls: string[],
  options?: InteropOptions,
): Promise<InteropTestResult> {
  const startTime = Date.now();
  const agents: AgentInfo[] = [];
  const results: ComplianceTestResult[] = [];
  let testIndex = 0;

  const defaults = options?.clientDefaults ?? {};

  // ─── Phase 1: Discover all agents ──────────────────────
  for (const url of agentUrls) {
    const client = new A2AClient({
      baseUrl: url,
      binding: (defaults.binding as 'HTTP+JSON' | 'JSONRPC') || 'HTTP+JSON',
      authorization: defaults.authorization,
      timeout: defaults.timeout,
    });

    let card: Record<string, unknown> = {};
    let binding: 'HTTP+JSON' | 'JSONRPC' = client.getBinding();
    try {
      card = await client.discoverAgentCard() as unknown as Record<string, unknown>;
      const detectedVersion = card.protocolVersion as string | undefined;
      if (detectedVersion) client.setAgentProtocolVersion(detectedVersion);

      const preferredTransport = card.preferredTransport as string | undefined;
      if (preferredTransport === 'JSONRPC') {
        client.setBinding('JSONRPC');
        binding = 'JSONRPC';
      } else if (detectedVersion?.startsWith('0.')) {
        client.setBinding('JSONRPC');
        binding = 'JSONRPC';
      }

      const agentUrl = card.url as string | undefined;
      if (agentUrl && binding === 'JSONRPC') {
        try {
          const parsed = new URL(agentUrl);
          if (parsed.pathname && parsed.pathname !== '/') {
            client.setRpcUrl(`${url.replace(/\/+$/, '')}${parsed.pathname}`);
          }
        } catch { /* ignore */ }
      }

      agents.push({ url, name: card.name as string | undefined, client, card, binding });
    } catch (err) {
      agents.push({ url, client, card, binding });
    }
  }

  // Total test count
  const pairCount = agents.length >= 2 ? agents.length * (agents.length - 1) : 0;
  const totalTests = agents.length + // discovery tests
    pairCount + // cross-discovery tests
    pairCount + // cross-message tests
    (agents.length >= 2 ? 1 : 0); // reference-task test
  const emit = (r: ComplianceTestResult) => {
    results.push(r);
    options?.onTestComplete?.(r, testIndex++, totalTests);
  };

  // ─── Test: Each agent is discoverable ──────────────────
  for (const agent of agents) {
    if (agent.card.name) {
      emit({
        id: `interop-discover-${agent.url}`,
        name: `Agent discoverable: ${agent.name || agent.url}`,
        description: 'Agent Card is reachable and parseable',
        result: 'pass',
        severity: 'info',
        message: `${agent.name} (${agent.binding})`,
      });
    } else {
      emit({
        id: `interop-discover-${agent.url}`,
        name: `Agent discoverable: ${agent.url}`,
        description: 'Agent Card is reachable and parseable',
        result: 'fail',
        severity: 'error',
        message: `Failed to discover agent at ${agent.url}`,
      });
    }
  }

  if (agents.length < 2) {
    emit({
      id: 'interop-insufficient-agents',
      name: 'Insufficient agents for interop',
      description: 'At least 2 agents are required for interop testing',
      result: 'fail',
      severity: 'error',
      message: `Only ${agents.length} agent(s) reachable — need at least 2`,
    });
    return buildResult(agents, results, startTime);
  }

  // ─── Test: Cross-discovery — each agent's card from another agent's perspective ─
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const from = agents[i];
      const to = agents[j];
      const start = Date.now();
      try {
        const crossClient = new A2AClient({
          baseUrl: to.url,
          binding: to.binding,
          authorization: defaults.authorization,
          timeout: defaults.timeout,
        });
        const card = await crossClient.discoverAgentCard();
        emit({
          id: `interop-cross-discover-${from.url}-${to.url}`,
          name: `Cross-discover: ${from.name || from.url} → ${to.name || to.url}`,
          description: 'One agent can discover the other agent',
          result: 'pass',
          severity: 'info',
          message: `Discovered ${(card as unknown as Record<string, unknown>).name}`,
          duration: Date.now() - start,
        });
      } catch (err) {
        emit({
          id: `interop-cross-discover-${from.url}-${to.url}`,
          name: `Cross-discover: ${from.name || from.url} → ${to.name || to.url}`,
          description: 'One agent can discover the other agent',
          result: 'fail',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          duration: Date.now() - start,
        });
      }
    }
  }

  // ─── Test: Cross-message — send message from one agent context to another ─
  const taskIds: Array<{ agentUrl: string; taskId: string; contextId?: string }> = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const from = agents[i];
      const to = agents[j];
      const start = Date.now();
      try {
        const request = to.client.createTextMessage(
          `Interop test from ${from.name || from.url}. What can you do?`,
        );
        const response = await to.client.sendMessage(request);
        const r = response as Record<string, unknown>;
        const task = r.task as Record<string, unknown> | undefined;
        const message = r.message as Record<string, unknown> | undefined;

        if (task?.id) {
          taskIds.push({ agentUrl: to.url, taskId: task.id as string, contextId: task.contextId as string | undefined });
        }

        const hasResponse = !!(task || message);
        emit({
          id: `interop-cross-message-${from.url}-${to.url}`,
          name: `Cross-message: ${from.name || from.url} → ${to.name || to.url}`,
          description: 'Agent accepts messages referencing another agent',
          result: hasResponse ? 'pass' : 'fail',
          severity: hasResponse ? 'info' : 'error',
          message: hasResponse
            ? `Received ${task ? 'task ' + (task.id as string).substring(0, 8) + '...' : 'message response'}`
            : 'No task or message in response',
          duration: Date.now() - start,
        });
      } catch (err) {
        emit({
          id: `interop-cross-message-${from.url}-${to.url}`,
          name: `Cross-message: ${from.name || from.url} → ${to.name || to.url}`,
          description: 'Agent accepts messages referencing another agent',
          result: 'fail',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          duration: Date.now() - start,
        });
      }
    }
  }

  // ─── Test: Reference task ID across agents ─────────────
  if (taskIds.length >= 2) {
    const start = Date.now();
    try {
      // Use the first task from agent B and reference it in a message to agent A
      const refTask = taskIds[0];
      const targetAgent = agents.find(a => a.url !== refTask.agentUrl) || agents[0];
      const request = targetAgent.client.createTextMessage(
        'Follow up referencing another agent task.',
      );
      // Add referenceTaskIds
      request.message.referenceTaskIds = [refTask.taskId];

      const response = await targetAgent.client.sendMessage(request);
      const r = response as Record<string, unknown>;
      const task = r.task as Record<string, unknown> | undefined;
      const message = r.message as Record<string, unknown> | undefined;

      emit({
        id: 'interop-reference-task',
        name: 'Cross-agent task reference',
        description: 'Agent accepts a message with referenceTaskIds from another agent',
        result: (task || message) ? 'pass' : 'warn',
        severity: 'info',
        message: (task || message)
          ? `Accepted message with referenceTaskIds=[${refTask.taskId.substring(0, 8)}...]`
          : 'No response for referenced task',
        duration: Date.now() - start,
      });
    } catch (err) {
      emit({
        id: 'interop-reference-task',
        name: 'Cross-agent task reference',
        description: 'Agent accepts a message with referenceTaskIds from another agent',
        result: 'warn',
        severity: 'warning',
        message: `referenceTaskIds not supported: ${err instanceof Error ? err.message : String(err)}`,
        duration: Date.now() - start,
      });
    }
  }

  return buildResult(agents, results, startTime);
}

function buildResult(
  agents: AgentInfo[],
  results: ComplianceTestResult[],
  startTime: number,
): InteropTestResult {
  return {
    agents: agents.map(a => ({ url: a.url, name: a.name })),
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    tests: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.result === 'pass').length,
      failed: results.filter(r => r.result === 'fail').length,
      warnings: results.filter(r => r.result === 'warn').length,
      skipped: results.filter(r => r.result === 'skip').length,
    },
  };
}
