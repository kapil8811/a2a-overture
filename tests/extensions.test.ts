import { describe, it, expect } from 'vitest';
import { getExtensionTests, allExtensionTests } from '../src/core/compliance/tests/extensions';

describe('Extension test registry', () => {
  it('should export all 8 extension tests', () => {
    expect(allExtensionTests).toHaveLength(8);
  });

  it('should include 2 generic tests (extensionId: *)', () => {
    const generic = allExtensionTests.filter(t => t.extensionId === '*');
    expect(generic).toHaveLength(2);
    expect(generic.map(t => t.id)).toContain('ext-card-extensions-valid');
    expect(generic.map(t => t.id)).toContain('ext-unsupported-rejected');
  });

  it('should include 2 timestamp tests', () => {
    const ts = allExtensionTests.filter(t => t.extensionId === 'timestamp');
    expect(ts).toHaveLength(2);
    expect(ts.map(t => t.id)).toContain('ext-timestamp-declared');
    expect(ts.map(t => t.id)).toContain('ext-timestamp-present');
  });

  it('should include 2 traceability tests', () => {
    const tr = allExtensionTests.filter(t => t.extensionId === 'traceability');
    expect(tr).toHaveLength(2);
    expect(tr.map(t => t.id)).toContain('ext-traceability-declared');
    expect(tr.map(t => t.id)).toContain('ext-traceability-response');
  });

  it('should include 2 secure-passport tests', () => {
    const sp = allExtensionTests.filter(t => t.extensionId === 'secure-passport');
    expect(sp).toHaveLength(2);
    expect(sp.map(t => t.id)).toContain('ext-secure-passport-declared');
    expect(sp.map(t => t.id)).toContain('ext-secure-passport-accepted');
  });

  it('every test should have required fields', () => {
    for (const test of allExtensionTests) {
      expect(test.id).toBeTruthy();
      expect(test.name).toBeTruthy();
      expect(test.description).toBeTruthy();
      expect(test.extensionId).toBeTruthy();
      expect(typeof test.run).toBe('function');
    }
  });
});

describe('getExtensionTests filtering', () => {
  it('should return all tests when no filter provided', () => {
    const tests = getExtensionTests();
    expect(tests).toHaveLength(8);
  });

  it('should return all tests when empty array provided', () => {
    const tests = getExtensionTests([]);
    expect(tests).toHaveLength(8);
  });

  it('should filter to timestamp + generic tests', () => {
    const tests = getExtensionTests(['timestamp']);
    // 2 generic (*) + 2 timestamp = 4
    expect(tests).toHaveLength(4);
    expect(tests.every(t => t.extensionId === '*' || t.extensionId === 'timestamp')).toBe(true);
  });

  it('should filter to traceability + generic tests', () => {
    const tests = getExtensionTests(['traceability']);
    expect(tests).toHaveLength(4);
    expect(tests.every(t => t.extensionId === '*' || t.extensionId === 'traceability')).toBe(true);
  });

  it('should filter to secure-passport + generic tests', () => {
    const tests = getExtensionTests(['secure-passport']);
    expect(tests).toHaveLength(4);
    expect(tests.every(t => t.extensionId === '*' || t.extensionId === 'secure-passport')).toBe(true);
  });

  it('should combine multiple extension filters', () => {
    const tests = getExtensionTests(['timestamp', 'traceability']);
    // 2 generic + 2 timestamp + 2 traceability = 6
    expect(tests).toHaveLength(6);
  });

  it('should return only generic tests for unknown extension', () => {
    const tests = getExtensionTests(['nonexistent']);
    expect(tests).toHaveLength(2);
    expect(tests.every(t => t.extensionId === '*')).toBe(true);
  });
});

describe('Extension tests against agent cards (unit)', () => {
  // We can test the card-level extension tests without a real server
  // by calling the run function with a mock client and agent card

  const mockClient = {
    discoverAgentCard: async () => ({}),
    createTextMessage: (text: string) => ({
      message: { messageId: 'test', role: 'ROLE_USER', parts: [{ text }] },
    }),
    sendMessage: async () => ({ task: { id: 't1', status: { state: 'TASK_STATE_COMPLETED' } } }),
  } as any;

  it('ext-card-extensions-valid: should skip if no capabilities', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-card-extensions-valid')!;
    const result = await test.run(mockClient, {});
    expect(result.result).toBe('skip');
  });

  it('ext-card-extensions-valid: should skip if no extensions declared', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-card-extensions-valid')!;
    const result = await test.run(mockClient, { capabilities: {} });
    expect(result.result).toBe('skip');
  });

  it('ext-card-extensions-valid: should pass for well-formed extensions', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-card-extensions-valid')!;
    const card = {
      capabilities: {
        extensions: [
          { uri: 'urn:a2a:ext:timestamp:v1', description: 'Adds timestamps' },
        ],
      },
    };
    const result = await test.run(mockClient, card);
    expect(result.result).toBe('pass');
  });

  it('ext-card-extensions-valid: should warn for malformed extensions', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-card-extensions-valid')!;
    const card = {
      capabilities: {
        extensions: [
          { uri: 'urn:a2a:ext:timestamp:v1' }, // missing description
        ],
      },
    };
    const result = await test.run(mockClient, card);
    expect(result.result).toBe('warn');
    expect(result.message).toContain('missing description');
  });

  it('ext-timestamp-declared: should fail if extension not in card', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-timestamp-declared')!;
    const result = await test.run(mockClient, { capabilities: {} });
    expect(result.result).toBe('fail');
  });

  it('ext-timestamp-declared: should pass if timestamp extension declared', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-timestamp-declared')!;
    const card = {
      capabilities: {
        extensions: [{ uri: 'urn:a2a:ext:timestamp:v1', description: 'Timestamps' }],
      },
    };
    const result = await test.run(mockClient, card);
    expect(result.result).toBe('pass');
  });

  it('ext-timestamp-present: should skip if extension not declared', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-timestamp-present')!;
    const result = await test.run(mockClient, { capabilities: {} });
    expect(result.result).toBe('skip');
  });

  it('ext-traceability-declared: should pass if traceability extension declared', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-traceability-declared')!;
    const card = {
      capabilities: {
        extensions: [{ uri: 'urn:a2a:ext:traceability:v1', description: 'Tracing' }],
      },
    };
    const result = await test.run(mockClient, card);
    expect(result.result).toBe('pass');
  });

  it('ext-secure-passport-declared: should pass if passport extension declared', async () => {
    const test = allExtensionTests.find(t => t.id === 'ext-secure-passport-declared')!;
    const card = {
      capabilities: {
        extensions: [{ uri: 'urn:a2a:ext:secure-passport:v1', description: 'Caller context' }],
      },
    };
    const result = await test.run(mockClient, card);
    expect(result.result).toBe('pass');
  });
});
