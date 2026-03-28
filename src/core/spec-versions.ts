/**
 * A2A Specification Version Tracking
 * 
 * Tracks which features and tests correspond to which spec versions,
 * making it easy to maintain coverage as the spec evolves.
 */

export interface SpecFeature {
  id: string;
  name: string;
  section: string;
  addedIn: string;
  removedIn?: string;
  testIds: string[];
  status: 'covered' | 'partial' | 'uncovered';
  notes?: string;
}

export interface SpecVersion {
  version: string;
  releaseDate?: string;
  features: SpecFeature[];
  changelogUrl?: string;
}

/**
 * A2A v1.0 specification feature coverage map.
 * Each feature maps to the compliance tests that verify it.
 */
export const A2A_V1_FEATURES: SpecFeature[] = [
  // Agent Card
  { id: 'agent-card', name: 'Agent Card Discovery', section: '3.1', addedIn: '1.0', testIds: ['card-reachable'], status: 'covered' },
  { id: 'agent-card-schema', name: 'Agent Card Schema Validation', section: '3.1', addedIn: '1.0', testIds: ['card-valid'], status: 'covered' },
  { id: 'agent-card-fields', name: 'Required Agent Card Fields', section: '3.1', addedIn: '1.0', testIds: ['card-required-fields'], status: 'covered' },
  { id: 'agent-card-skills', name: 'Skill Declaration', section: '3.1.4', addedIn: '1.0', testIds: ['card-has-skills'], status: 'covered' },
  { id: 'agent-card-https', name: 'HTTPS Transport Security', section: '3.1.2', addedIn: '1.0', testIds: ['card-https'], status: 'covered' },

  // Core Messaging
  { id: 'send-message', name: 'SendMessage', section: '4.1', addedIn: '1.0', testIds: ['send-message'], status: 'covered' },
  { id: 'get-task', name: 'GetTask', section: '4.2', addedIn: '1.0', testIds: ['get-task'], status: 'covered' },
  { id: 'cancel-task', name: 'CancelTask', section: '4.3', addedIn: '1.0', testIds: ['cancel-task'], status: 'covered' },
  { id: 'list-tasks', name: 'ListTasks', section: '4.4', addedIn: '1.0', testIds: ['list-tasks'], status: 'covered' },
  { id: 'task-not-found', name: 'TaskNotFoundError', section: '5.1', addedIn: '1.0', testIds: ['invalid-task-error'], status: 'covered' },

  // Streaming
  { id: 'streaming', name: 'SendStreamingMessage (SSE)', section: '4.5', addedIn: '1.0', testIds: ['streaming'], status: 'covered' },
  { id: 'subscribe-task', name: 'SubscribeToTask', section: '4.6', addedIn: '1.0', testIds: ['subscribe-task'], status: 'covered' },

  // Multi-turn
  { id: 'multi-turn-context', name: 'Multi-turn via contextId', section: '4.7', addedIn: '1.0', testIds: ['multi-turn-context'], status: 'covered' },
  { id: 'multi-turn-task', name: 'Multi-turn via taskId', section: '4.7', addedIn: '1.0', testIds: ['multi-turn-task'], status: 'covered' },
  { id: 'multi-turn-history', name: 'Message History in GetTask', section: '4.7', addedIn: '1.0', testIds: ['multi-turn-history'], status: 'covered' },

  // Push Notifications
  { id: 'push-capability', name: 'Push Notification Capability', section: '6.1', addedIn: '1.0', testIds: ['push-notification-capability'], status: 'covered' },
  { id: 'push-reject', name: 'Push Config Rejection', section: '6.2', addedIn: '1.0', testIds: ['push-notification-reject'], status: 'covered' },
  { id: 'push-set', name: 'SetPushNotificationConfig', section: '6.3', addedIn: '1.0', testIds: ['push-set-config'], status: 'covered' },
  { id: 'push-get', name: 'GetPushNotificationConfig', section: '6.4', addedIn: '1.0', testIds: ['push-get-config'], status: 'covered' },
  { id: 'push-delete', name: 'DeletePushNotificationConfig', section: '6.5', addedIn: '1.0', testIds: ['push-delete-config'], status: 'covered' },

  // Protocol
  { id: 'version-header', name: 'A2A-Version Header', section: '2.3', addedIn: '1.0', testIds: ['version-header'], status: 'covered' },

  // Security
  { id: 'auth-unauthorized', name: 'Authentication Enforcement', section: '7.1', addedIn: '1.0', testIds: ['auth-unauthorized'], status: 'covered' },
  { id: 'auth-schemes', name: 'Security Scheme Validation', section: '7.2', addedIn: '1.0', testIds: ['auth-security-schemes'], status: 'covered' },

  // Agent Card Signature
  { id: 'agent-card-signature', name: 'Agent Card Signature Verification', section: '3.1.5', addedIn: '1.0', testIds: ['card-signature-valid'], status: 'covered' },

  // Extensions (tested when --extensions flag is used)
  { id: 'ext-declaration', name: 'Extension Declaration Validation', section: '8.1', addedIn: '1.0', testIds: ['ext-card-extensions-valid', 'ext-unsupported-rejected'], status: 'covered' },
  { id: 'ext-timestamp', name: 'Timestamp Extension', section: '8.2', addedIn: '1.0', testIds: ['ext-timestamp-declared', 'ext-timestamp-present'], status: 'covered' },
  { id: 'ext-traceability', name: 'Traceability Extension', section: '8.3', addedIn: '1.0', testIds: ['ext-traceability-declared', 'ext-traceability-response'], status: 'covered' },
  { id: 'ext-secure-passport', name: 'Secure Passport Extension', section: '8.4', addedIn: '1.0', testIds: ['ext-secure-passport-declared', 'ext-secure-passport-accepted'], status: 'covered' },
];

/**
 * All tracked spec versions with their feature sets.
 */
export const SPEC_VERSIONS: SpecVersion[] = [
  {
    version: '1.0',
    releaseDate: '2025-04-09',
    changelogUrl: 'https://github.com/a2a-protocol/a2a-spec/releases/tag/v1.0',
    features: A2A_V1_FEATURES,
  },
  // Future versions will be added here:
  // {
  //   version: '1.1',
  //   releaseDate: '2025-XX-XX',
  //   features: [...A2A_V1_FEATURES, ...newFeatures],
  // },
];

/**
 * Get coverage statistics for a specific spec version.
 */
export function getSpecCoverage(version: string): {
  total: number;
  covered: number;
  partial: number;
  uncovered: number;
  percentage: number;
  features: SpecFeature[];
} {
  const spec = SPEC_VERSIONS.find(v => v.version === version);
  if (!spec) {
    return { total: 0, covered: 0, partial: 0, uncovered: 0, percentage: 0, features: [] };
  }

  const features = spec.features.filter(f => !f.removedIn || f.removedIn > version);
  const covered = features.filter(f => f.status === 'covered').length;
  const partial = features.filter(f => f.status === 'partial').length;
  const uncovered = features.filter(f => f.status === 'uncovered').length;

  return {
    total: features.length,
    covered,
    partial,
    uncovered,
    percentage: features.length > 0 ? Math.round((covered / features.length) * 100) : 0,
    features,
  };
}

/**
 * Print spec coverage report to console.
 */
export function printSpecCoverage(version: string): void {
  const coverage = getSpecCoverage(version);
  console.log(`\nA2A v${version} Specification Coverage`);
  console.log('═'.repeat(50));
  console.log(`  Total features:  ${coverage.total}`);
  console.log(`  Covered:         ${coverage.covered} ✅`);
  console.log(`  Partial:         ${coverage.partial} ⚠️`);
  console.log(`  Uncovered:       ${coverage.uncovered} ❌`);
  console.log(`  Coverage:        ${coverage.percentage}%`);
  console.log('');

  const groupedBySection = new Map<string, SpecFeature[]>();
  for (const f of coverage.features) {
    const section = f.section.split('.')[0];
    if (!groupedBySection.has(section)) groupedBySection.set(section, []);
    groupedBySection.get(section)!.push(f);
  }

  for (const [, features] of groupedBySection) {
    for (const f of features) {
      const icon = f.status === 'covered' ? '✅' : f.status === 'partial' ? '⚠️' : '❌';
      console.log(`  ${icon} §${f.section} ${f.name} → [${f.testIds.join(', ')}]`);
    }
  }
  console.log('');
}
