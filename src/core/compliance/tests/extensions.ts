import { ComplianceTestResult } from '../../types';
import { A2AClient, A2AError } from '../../client';

export interface ExtensionComplianceTest {
  id: string;
  name: string;
  description: string;
  extensionId: string;
  run: (client: A2AClient, agentCard: Record<string, unknown>) => Promise<ComplianceTestResult>;
}

/** Check if the agent card declares a given extension URI (substring match) */
function agentDeclaresExtension(agentCard: Record<string, unknown>, extensionKey: string): boolean {
  const caps = agentCard.capabilities as Record<string, unknown> | undefined;
  if (!caps) return false;
  const extensions = caps.extensions as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(extensions)) return false;
  return extensions.some(ext => {
    const uri = ext.uri as string | undefined;
    return uri && uri.toLowerCase().includes(extensionKey.toLowerCase());
  });
}

/** Extract metadata from message/task response */
function extractMetadata(response: Record<string, unknown>): Record<string, unknown> | undefined {
  // v1.0: { task: { ... } } or { message: { ... } }
  const task = response.task as Record<string, unknown> | undefined;
  if (task) {
    // Check artifacts for metadata
    const artifacts = task.artifacts as Array<Record<string, unknown>> | undefined;
    if (artifacts?.[0]?.metadata) return artifacts[0].metadata as Record<string, unknown>;
    // Check status message for metadata
    const status = task.status as Record<string, unknown> | undefined;
    const statusMsg = status?.message as Record<string, unknown> | undefined;
    if (statusMsg?.metadata) return statusMsg.metadata as Record<string, unknown>;
    if (task.metadata) return task.metadata as Record<string, unknown>;
  }
  const message = response.message as Record<string, unknown> | undefined;
  if (message?.metadata) return message.metadata as Record<string, unknown>;
  // v0.3.x: direct task/message at top level
  if (response.metadata) return response.metadata as Record<string, unknown>;
  return undefined;
}

// ─── Timestamp Extension Tests ──────────────────────────

const timestampDeclared: ExtensionComplianceTest = {
  id: 'ext-timestamp-declared',
  name: 'Timestamp extension declared in Agent Card',
  description: 'Agent Card capabilities.extensions should include the timestamp extension URI',
  extensionId: 'timestamp',
  async run(_client, agentCard) {
    if (agentDeclaresExtension(agentCard, 'timestamp')) {
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Timestamp extension declared' };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Timestamp extension URI not found in capabilities.extensions' };
  },
};

const timestampPresent: ExtensionComplianceTest = {
  id: 'ext-timestamp-present',
  name: 'Timestamp metadata in responses',
  description: 'Messages or artifacts should include timestamp metadata when the extension is active',
  extensionId: 'timestamp',
  async run(client, agentCard) {
    if (!agentDeclaresExtension(agentCard, 'timestamp')) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not declare timestamp extension' };
    }

    try {
      const request = client.createTextMessage('Timestamp extension test.');
      // Set extension header on the message
      request.message.extensions = request.message.extensions || [];
      if (!request.message.extensions.some(e => e.toLowerCase().includes('timestamp'))) {
        // Try to find the exact URI from the agent card
        const caps = agentCard.capabilities as Record<string, unknown> | undefined;
        const extensions = caps?.extensions as Array<Record<string, unknown>> | undefined;
        const tsExt = extensions?.find(e => (e.uri as string || '').toLowerCase().includes('timestamp'));
        if (tsExt?.uri) {
          request.message.extensions.push(tsExt.uri as string);
        }
      }

      const start = Date.now();
      const response = await client.sendMessage(request);
      const duration = Date.now() - start;
      const r = response as Record<string, unknown>;
      const metadata = extractMetadata(r);

      if (!metadata) {
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'No metadata found in response — cannot verify timestamps', duration };
      }

      // Look for any timestamp-like key in metadata
      const hasTimestamp = Object.entries(metadata).some(([key, val]) => {
        if (key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('created') || key.toLowerCase().includes('time')) {
          return typeof val === 'string' && !isNaN(Date.parse(val));
        }
        // Check nested extension metadata
        if (typeof val === 'object' && val !== null) {
          return Object.values(val as Record<string, unknown>).some(v =>
            typeof v === 'string' && !isNaN(Date.parse(v))
          );
        }
        return false;
      });

      if (hasTimestamp) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Timestamp metadata found in response', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Metadata present but no recognizable timestamp fields', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Traceability Extension Tests ───────────────────────

const traceabilityDeclared: ExtensionComplianceTest = {
  id: 'ext-traceability-declared',
  name: 'Traceability extension declared in Agent Card',
  description: 'Agent Card capabilities.extensions should include the traceability extension URI',
  extensionId: 'traceability',
  async run(_client, agentCard) {
    if (agentDeclaresExtension(agentCard, 'traceability')) {
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Traceability extension declared' };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Traceability extension URI not found in capabilities.extensions' };
  },
};

const traceabilityResponse: ExtensionComplianceTest = {
  id: 'ext-traceability-response',
  name: 'Traceability data in responses',
  description: 'When traceability extension is active, responses should include trace information',
  extensionId: 'traceability',
  async run(client, agentCard) {
    if (!agentDeclaresExtension(agentCard, 'traceability')) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not declare traceability extension' };
    }

    try {
      const request = client.createTextMessage('Traceability extension test.');
      request.message.extensions = request.message.extensions || [];
      const caps = agentCard.capabilities as Record<string, unknown> | undefined;
      const extensions = caps?.extensions as Array<Record<string, unknown>> | undefined;
      const traceExt = extensions?.find(e => (e.uri as string || '').toLowerCase().includes('traceability'));
      if (traceExt?.uri) {
        request.message.extensions.push(traceExt.uri as string);
      }

      const start = Date.now();
      const response = await client.sendMessage(request);
      const duration = Date.now() - start;
      const r = response as Record<string, unknown>;
      const metadata = extractMetadata(r);

      if (!metadata) {
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'No metadata found in response — cannot verify traceability', duration };
      }

      // Look for trace-like data: trace_id, steps, latency, etc.
      const hasTrace = Object.entries(metadata).some(([key, val]) => {
        const k = key.toLowerCase();
        return k.includes('trace') || k.includes('step') || k.includes('latency') || k.includes('span');
      });

      if (hasTrace) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Traceability data found in response metadata', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Metadata present but no recognizable traceability fields', duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Secure Passport Extension Tests ────────────────────

const securePassportDeclared: ExtensionComplianceTest = {
  id: 'ext-secure-passport-declared',
  name: 'Secure Passport extension declared in Agent Card',
  description: 'Agent Card capabilities.extensions should include the secure-passport extension URI',
  extensionId: 'secure-passport',
  async run(_client, agentCard) {
    if (agentDeclaresExtension(agentCard, 'secure-passport') || agentDeclaresExtension(agentCard, 'passport')) {
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Secure Passport extension declared' };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: 'Secure Passport extension URI not found in capabilities.extensions' };
  },
};

const securePassportAccepted: ExtensionComplianceTest = {
  id: 'ext-secure-passport-accepted',
  name: 'Secure Passport CallerContext accepted',
  description: 'Sending a message with CallerContext metadata should be accepted by the agent',
  extensionId: 'secure-passport',
  async run(client, agentCard) {
    const hasPassport = agentDeclaresExtension(agentCard, 'secure-passport') || agentDeclaresExtension(agentCard, 'passport');
    if (!hasPassport) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'Agent does not declare Secure Passport extension' };
    }

    try {
      const request = client.createTextMessage('Secure Passport test.');
      // Attach a sample CallerContext in metadata
      request.message.metadata = {
        ...request.message.metadata,
        callerContext: {
          clientId: 'overture-test',
          sessionId: 'test-session-001',
          state: { role: 'tester', tier: 'standard' },
        },
      };

      const caps = agentCard.capabilities as Record<string, unknown> | undefined;
      const extensions = caps?.extensions as Array<Record<string, unknown>> | undefined;
      const passportExt = extensions?.find(e => {
        const uri = (e.uri as string || '').toLowerCase();
        return uri.includes('secure-passport') || uri.includes('passport');
      });
      if (passportExt?.uri) {
        request.message.extensions = request.message.extensions || [];
        request.message.extensions.push(passportExt.uri as string);
      }

      const start = Date.now();
      const response = await client.sendMessage(request);
      const duration = Date.now() - start;
      const r = response as Record<string, unknown>;

      // If the agent processed the message without error, the extension was accepted
      if (r.task || r.message || r.id) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent accepted message with CallerContext metadata', duration };
      }
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Unexpected response format', duration };
    } catch (err) {
      if (err instanceof A2AError && err.code === -32008) {
        return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: 'Agent returned EXTENSION_SUPPORT_REQUIRED — may need specific extension params' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── Generic Extension Tests ────────────────────────────

const extensionsDeclaredInCard: ExtensionComplianceTest = {
  id: 'ext-card-extensions-valid',
  name: 'Extension declarations are well-formed',
  description: 'Each extension in capabilities.extensions should have a URI and description',
  extensionId: '*',
  async run(_client, agentCard) {
    const caps = agentCard.capabilities as Record<string, unknown> | undefined;
    if (!caps) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No capabilities object in Agent Card' };
    }

    const extensions = caps.extensions as Array<Record<string, unknown>> | undefined;
    if (!extensions || extensions.length === 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'skip', severity: 'info', message: 'No extensions declared in Agent Card' };
    }

    const issues: string[] = [];
    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];
      if (!ext.uri || typeof ext.uri !== 'string') {
        issues.push(`extensions[${i}]: missing or invalid URI`);
      }
      if (!ext.description || typeof ext.description !== 'string') {
        issues.push(`extensions[${i}]: missing description`);
      }
    }

    if (issues.length > 0) {
      return { id: this.id, name: this.name, description: this.description, result: 'warn', severity: 'warning', message: issues.join('; ') };
    }
    return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: `${extensions.length} extension(s) validated` };
  },
};

const extensionUnsupportedRejected: ExtensionComplianceTest = {
  id: 'ext-unsupported-rejected',
  name: 'Unsupported extension is handled gracefully',
  description: 'Requesting an undeclared extension should be rejected with EXTENSION_SUPPORT_REQUIRED or handled gracefully',
  extensionId: '*',
  async run(client) {
    try {
      const request = client.createTextMessage('Extension rejection test.');
      request.message.extensions = ['urn:a2a:ext:nonexistent-extension:v999'];

      const start = Date.now();
      const response = await client.sendMessage(request);
      const duration = Date.now() - start;

      // Agent ignored the unknown extension — acceptable
      return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Agent handled unknown extension gracefully (ignored)', duration };
    } catch (err) {
      if (err instanceof A2AError && err.code === -32008) {
        return { id: this.id, name: this.name, description: this.description, result: 'pass', severity: 'info', message: 'Correctly returned EXTENSION_SUPPORT_REQUIRED (-32008)' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { id: this.id, name: this.name, description: this.description, result: 'fail', severity: 'error', message: msg };
    }
  },
};

// ─── All Extension Tests ────────────────────────────────

export const allExtensionTests: ExtensionComplianceTest[] = [
  extensionsDeclaredInCard,
  extensionUnsupportedRejected,
  timestampDeclared,
  timestampPresent,
  traceabilityDeclared,
  traceabilityResponse,
  securePassportDeclared,
  securePassportAccepted,
];

/** Get extension tests filtered by extension IDs */
export function getExtensionTests(extensionIds?: string[]): ExtensionComplianceTest[] {
  if (!extensionIds || extensionIds.length === 0) {
    return allExtensionTests;
  }
  return allExtensionTests.filter(t =>
    t.extensionId === '*' || extensionIds.includes(t.extensionId)
  );
}
