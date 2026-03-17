import { A2AClient, ClientOptions } from '../client';
import { ComplianceReport, ComplianceTestResult } from '../types';
import { allComplianceTests, ComplianceTest } from './tests/a2a-v1';

export interface RunnerOptions {
  /** Only run tests matching these IDs */
  testIds?: string[];
  /** Skip tests matching these IDs */
  skipIds?: string[];
  /** Called after each test completes */
  onTestComplete?: (result: ComplianceTestResult, index: number, total: number) => void;
}

export async function runComplianceSuite(
  clientOptions: ClientOptions,
  runnerOptions?: RunnerOptions,
): Promise<ComplianceReport> {
  const client = new A2AClient(clientOptions);
  const startTime = Date.now();

  // Try to fetch Agent Card for test context
  let agentCard: Record<string, unknown> = {};
  try {
    agentCard = await client.discoverAgentCard() as unknown as Record<string, unknown>;

    // Auto-detect agent protocol version for method name compatibility
    const detectedVersion = agentCard.protocolVersion as string | undefined;
    if (detectedVersion) {
      client.setAgentProtocolVersion(detectedVersion);
    }

    // Auto-detect RPC endpoint URL from agent card (e.g., /a2a/v1)
    const agentUrl = agentCard.url as string | undefined;
    if (agentUrl && clientOptions.binding === 'JSONRPC') {
      try {
        const parsed = new URL(agentUrl);
        if (parsed.pathname && parsed.pathname !== '/') {
          client.setRpcUrl(`${clientOptions.baseUrl.replace(/\/+$/, '')}${parsed.pathname}`);
        }
      } catch {
        // Invalid URL, ignore
      }
    }
  } catch {
    // Will be caught by the agent card reachability test
  }

  // Filter tests
  let tests = allComplianceTests;
  if (runnerOptions?.testIds?.length) {
    tests = tests.filter(t => runnerOptions.testIds!.includes(t.id));
  }
  if (runnerOptions?.skipIds?.length) {
    tests = tests.filter(t => !runnerOptions.skipIds!.includes(t.id));
  }

  const results: ComplianceTestResult[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    let result: ComplianceTestResult;

    try {
      result = await test.run(client, agentCard);
    } catch (err) {
      result = {
        id: test.id,
        name: test.name,
        description: test.description,
        result: 'fail',
        severity: 'error',
        message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    results.push(result);
    runnerOptions?.onTestComplete?.(result, i, tests.length);
  }

  const duration = Date.now() - startTime;

  const summary = {
    total: results.length,
    passed: results.filter(r => r.result === 'pass').length,
    failed: results.filter(r => r.result === 'fail').length,
    warnings: results.filter(r => r.result === 'warn').length,
    skipped: results.filter(r => r.result === 'skip').length,
  };

  return {
    agentUrl: clientOptions.baseUrl,
    agentName: agentCard.name as string | undefined,
    protocolVersion: clientOptions.protocolVersion || '1.0',
    timestamp: new Date().toISOString(),
    duration,
    summary,
    tests: results,
  };
}
