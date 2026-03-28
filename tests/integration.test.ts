import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockA2AServer } from '../src/mock/server';
import { runComplianceSuite } from '../src/core/compliance/runner';
import { validateAgentCard } from '../src/core/validator';
import { A2AClient } from '../src/core/client';
import { allComplianceTests } from '../src/core/compliance/tests/a2a-v1';
import { allExtensionTests } from '../src/core/compliance/tests/extensions';

describe('Integration: Full compliance suite against mock server', () => {
  let mockServer: MockA2AServer;
  const PORT = 13010;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    mockServer = new MockA2AServer({ port: PORT, streaming: true });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should discover a valid Agent Card', async () => {
    const client = new A2AClient({ baseUrl: BASE_URL, binding: 'HTTP+JSON' });
    const card = await client.discoverAgentCard();
    expect(card.name).toBe('Overture Mock Agent');
    expect(card.supportedInterfaces).toHaveLength(2);
    expect(card.skills).toHaveLength(3);
  });

  it('should validate the mock Agent Card schema', async () => {
    const client = new A2AClient({ baseUrl: BASE_URL, binding: 'HTTP+JSON' });
    const card = await client.discoverAgentCard();
    const validation = validateAgentCard(card);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should pass all 24 core compliance tests', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON' },
    );

    expect(report.agentUrl).toBe(BASE_URL);
    expect(report.agentName).toBe('Overture Mock Agent');

    // Log any failures for debugging
    const failures = report.tests.filter(t => t.result === 'fail');
    if (failures.length > 0) {
      console.log('Failures:');
      for (const f of failures) {
        console.log(`  ${f.id}: ${f.message}`);
      }
    }

    // The mock server should pass all tests (card-signature-valid will skip since no signatures)
    expect(report.summary.failed).toBe(0);
    expect(report.summary.total).toBe(allComplianceTests.length);
  });

  it('should pass compliance via JSON-RPC binding', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'JSONRPC' },
    );

    const failures = report.tests.filter(t => t.result === 'fail');
    if (failures.length > 0) {
      console.log('JSON-RPC Failures:');
      for (const f of failures) {
        console.log(`  ${f.id}: ${f.message}`);
      }
    }

    expect(report.summary.failed).toBe(0);
  });

  it('should run extension tests and skip gracefully (no extensions on mock)', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON' },
      { extensions: ['timestamp', 'traceability', 'secure-passport'] },
    );

    // Core tests + extension tests
    expect(report.summary.total).toBe(allComplianceTests.length + 8);

    // Extension declaration tests should fail/skip (mock doesn't declare extensions)
    const extResults = report.tests.filter(t => t.id.startsWith('ext-'));
    expect(extResults.length).toBe(8);

    // Generic extension tests
    const cardExtValid = extResults.find(t => t.id === 'ext-card-extensions-valid');
    expect(cardExtValid?.result).toBe('skip'); // no extensions in mock card

    // Extension-specific declaration tests should fail (not declared in mock)
    const tsDeclared = extResults.find(t => t.id === 'ext-timestamp-declared');
    expect(tsDeclared?.result).toBe('fail');

    // Extension data tests should skip (not declared)
    const tsPresent = extResults.find(t => t.id === 'ext-timestamp-present');
    expect(tsPresent?.result).toBe('skip');
  });

  it('should support selective test execution with --only', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON' },
      { testIds: ['card-reachable', 'card-valid', 'send-message'] },
    );

    expect(report.summary.total).toBe(3);
    expect(report.tests.map(t => t.id)).toEqual(['card-reachable', 'card-valid', 'send-message']);
  });

  it('should support selective test exclusion with --skip', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON' },
      { skipIds: ['card-signature-valid'] },
    );

    expect(report.summary.total).toBe(allComplianceTests.length - 1);
    expect(report.tests.find(t => t.id === 'card-signature-valid')).toBeUndefined();
  });

  it('signature test should skip for unsigned mock agent card', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON' },
      { testIds: ['card-signature-valid'] },
    );

    expect(report.tests).toHaveLength(1);
    expect(report.tests[0].result).toBe('skip');
    expect(report.tests[0].message).toContain('no signatures');
  });
});

describe('Integration: Mock server with auth token', () => {
  let mockServer: MockA2AServer;
  const PORT = 13011;
  const BASE_URL = `http://localhost:${PORT}`;
  const AUTH_TOKEN = 'test-secret-token-123';

  beforeAll(async () => {
    mockServer = new MockA2AServer({ port: PORT, authToken: AUTH_TOKEN });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should allow agent card discovery without auth', async () => {
    const client = new A2AClient({ baseUrl: BASE_URL, binding: 'HTTP+JSON' });
    const card = await client.discoverAgentCard();
    expect(card.name).toBe('Overture Mock Agent');
    expect(card.securitySchemes).toBeDefined();
  });

  it('should reject unauthenticated message sends', async () => {
    const client = new A2AClient({ baseUrl: BASE_URL, binding: 'HTTP+JSON' });
    const request = client.createTextMessage('Should fail');
    await expect(client.sendMessage(request)).rejects.toThrow();
  });

  it('should accept authenticated message sends', async () => {
    const client = new A2AClient({
      baseUrl: BASE_URL,
      binding: 'HTTP+JSON',
      authorization: `Bearer ${AUTH_TOKEN}`,
    });
    const request = client.createTextMessage('Should succeed');
    const response = await client.sendMessage(request);
    expect((response as any).task).toBeDefined();
  });

  it('auth-unauthorized test should pass', async () => {
    const report = await runComplianceSuite(
      { baseUrl: BASE_URL, binding: 'HTTP+JSON', authorization: `Bearer ${AUTH_TOKEN}` },
      { testIds: ['auth-unauthorized'] },
    );
    expect(report.tests[0].result).toBe('pass');
  });
});
