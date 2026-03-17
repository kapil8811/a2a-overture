import { ComplianceReport, ComplianceTestResult, TestResult } from '../core/types';
import { ValidationResult } from '../core/validator';

// ANSI colors (no dependency needed for basic colors)
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const icons = {
  pass: `${colors.green}✔${colors.reset}`,
  fail: `${colors.red}✖${colors.reset}`,
  warn: `${colors.yellow}⚠${colors.reset}`,
  skip: `${colors.dim}○${colors.reset}`,
  info: `${colors.blue}ℹ${colors.reset}`,
  arrow: `${colors.cyan}→${colors.reset}`,
  dot: `${colors.dim}·${colors.reset}`,
};

export function printBanner() {
  console.log('');
  console.log(`${colors.cyan}${colors.bold}  ╔══════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  ║      A 2 A   O V E R T U R E         ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  ║ The opening act for your A2A agents  ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  ╚══════════════════════════════════════╝${colors.reset}`);
  console.log('');
}

export function printAgentCard(card: Record<string, unknown>) {
  console.log(`${colors.bold}Agent Card${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  ${icons.arrow} Name:        ${colors.bold}${card.name}${colors.reset}`);
  console.log(`  ${icons.arrow} Description: ${card.description}`);
  console.log(`  ${icons.arrow} Version:     ${card.version}`);

  if (card.provider && typeof card.provider === 'object') {
    const p = card.provider as Record<string, unknown>;
    console.log(`  ${icons.arrow} Provider:    ${p.organization} (${p.url})`);
  }

  // Interfaces
  if (Array.isArray(card.supportedInterfaces)) {
    console.log('');
    console.log(`  ${colors.bold}Interfaces${colors.reset}`);
    for (const iface of card.supportedInterfaces) {
      const f = iface as Record<string, unknown>;
      console.log(`    ${icons.dot} ${f.protocolBinding} v${f.protocolVersion} ${colors.dim}${f.url}${colors.reset}`);
    }
  }

  // Capabilities
  if (card.capabilities && typeof card.capabilities === 'object') {
    const caps = card.capabilities as Record<string, unknown>;
    console.log('');
    console.log(`  ${colors.bold}Capabilities${colors.reset}`);
    console.log(`    ${icons.dot} Streaming:          ${formatBool(caps.streaming)}`);
    console.log(`    ${icons.dot} Push Notifications: ${formatBool(caps.pushNotifications)}`);
    console.log(`    ${icons.dot} Extended Card:      ${formatBool(caps.extendedAgentCard)}`);
  }

  // Skills
  if (Array.isArray(card.skills)) {
    console.log('');
    console.log(`  ${colors.bold}Skills (${card.skills.length})${colors.reset}`);
    for (const skill of card.skills) {
      const s = skill as Record<string, unknown>;
      console.log(`    ${icons.arrow} ${colors.cyan}${s.id}${colors.reset} — ${s.name}`);
      console.log(`      ${colors.dim}${s.description}${colors.reset}`);
      if (Array.isArray(s.tags) && s.tags.length > 0) {
        console.log(`      Tags: ${(s.tags as string[]).map(t => `${colors.magenta}#${t}${colors.reset}`).join(' ')}`);
      }
      if (Array.isArray(s.examples) && s.examples.length > 0) {
        console.log(`      Examples:`);
        for (const ex of s.examples.slice(0, 3)) {
          console.log(`        ${colors.dim}"${ex}"${colors.reset}`);
        }
      }
    }
  }

  // Security
  if (card.securitySchemes && typeof card.securitySchemes === 'object') {
    console.log('');
    console.log(`  ${colors.bold}Security Schemes${colors.reset}`);
    for (const [name, scheme] of Object.entries(card.securitySchemes as Record<string, unknown>)) {
      const s = scheme as Record<string, unknown>;
      const type = Object.keys(s).find(k => k.endsWith('SecurityScheme') || k.endsWith('Scheme')) || 'unknown';
      console.log(`    ${icons.dot} ${name}: ${type}`);
    }
  }

  console.log('');
}

export function printValidationResult(result: ValidationResult) {
  if (result.valid && result.warnings.length === 0) {
    console.log(`${icons.pass} ${colors.green}Agent Card is valid${colors.reset}`);
    return;
  }

  if (result.valid) {
    console.log(`${icons.warn} ${colors.yellow}Agent Card is valid with warnings${colors.reset}`);
  } else {
    console.log(`${icons.fail} ${colors.red}Agent Card validation failed${colors.reset}`);
  }

  if (result.errors.length > 0) {
    console.log('');
    console.log(`  ${colors.red}${colors.bold}Errors (${result.errors.length})${colors.reset}`);
    for (const err of result.errors) {
      console.log(`    ${icons.fail} ${colors.bold}${err.path || '(root)'}${colors.reset}: ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('');
    console.log(`  ${colors.yellow}${colors.bold}Warnings (${result.warnings.length})${colors.reset}`);
    for (const warn of result.warnings) {
      console.log(`    ${icons.warn} ${colors.bold}${warn.path || '(root)'}${colors.reset}: ${warn.message}`);
    }
  }
  console.log('');
}

export function printComplianceReport(report: ComplianceReport) {
  console.log(`${colors.bold}Compliance Report${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  Agent:    ${report.agentName || report.agentUrl}`);
  console.log(`  URL:      ${report.agentUrl}`);
  console.log(`  Protocol: A2A v${report.protocolVersion}`);
  console.log(`  Time:     ${report.timestamp}`);
  console.log(`  Duration: ${report.duration}ms`);
  console.log('');

  // Summary bar
  const { total, passed, failed, warnings, skipped } = report.summary;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const barLength = 30;
  const filledLength = Math.round((passRate / 100) * barLength);
  const bar = `${colors.green}${'█'.repeat(filledLength)}${colors.red}${'█'.repeat(barLength - filledLength)}${colors.reset}`;

  console.log(`  ${bar} ${passRate}%`);
  console.log(`  ${icons.pass} ${passed} passed  ${icons.fail} ${failed} failed  ${icons.warn} ${warnings} warnings  ${icons.skip} ${skipped} skipped`);
  console.log('');

  // Individual tests
  console.log(`  ${colors.bold}Tests${colors.reset}`);
  for (const test of report.tests) {
    const icon = getResultIcon(test.result);
    const duration = test.duration ? ` ${colors.dim}(${test.duration}ms)${colors.reset}` : '';
    console.log(`    ${icon} ${test.name}${duration}`);
    if (test.result === 'fail' && test.message) {
      console.log(`      ${colors.red}${test.message}${colors.reset}`);
    }
    if (test.result === 'warn' && test.message) {
      console.log(`      ${colors.yellow}${test.message}${colors.reset}`);
    }
  }
  console.log('');

  // Final verdict
  if (failed === 0) {
    console.log(`  ${colors.bgGreen}${colors.white}${colors.bold} PASS ${colors.reset} Agent is A2A v${report.protocolVersion} compliant`);
  } else {
    console.log(`  ${colors.bgRed}${colors.white}${colors.bold} FAIL ${colors.reset} ${failed} compliance issue(s) found`);
  }
  console.log('');
}

export function printTaskSummary(task: Record<string, unknown>) {
  console.log(`${colors.bold}Task${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  ${icons.arrow} ID:        ${task.id}`);
  if (task.contextId) {
    console.log(`  ${icons.arrow} Context:   ${task.contextId}`);
  }
  const status = task.status as Record<string, unknown> | undefined;
  if (status) {
    const stateColor = getStateColor(status.state as string);
    console.log(`  ${icons.arrow} State:     ${stateColor}${status.state}${colors.reset}`);
    if (status.timestamp) {
      console.log(`  ${icons.arrow} Updated:   ${status.timestamp}`);
    }
  }

  // Artifacts
  if (Array.isArray(task.artifacts) && task.artifacts.length > 0) {
    console.log('');
    console.log(`  ${colors.bold}Artifacts (${task.artifacts.length})${colors.reset}`);
    for (const artifact of task.artifacts) {
      const a = artifact as Record<string, unknown>;
      console.log(`    ${icons.arrow} ${a.artifactId}${a.name ? ` — ${a.name}` : ''}`);
      if (Array.isArray(a.parts)) {
        for (const part of a.parts) {
          const p = part as Record<string, unknown>;
          if (p.text) {
            const text = String(p.text);
            const preview = text.length > 200 ? text.slice(0, 200) + '...' : text;
            console.log(`      ${colors.dim}${preview}${colors.reset}`);
          } else if (p.url) {
            console.log(`      ${colors.blue}${p.url}${colors.reset}`);
          } else if (p.data) {
            console.log(`      ${colors.dim}[structured data]${colors.reset}`);
          }
        }
      }
    }
  }
  console.log('');
}

export function printStreamEvent(event: Record<string, unknown>) {
  if (event.task) {
    const task = event.task as Record<string, unknown>;
    const status = task.status as Record<string, unknown> | undefined;
    console.log(`${icons.info} ${colors.bold}Task${colors.reset} ${task.id} ${getStateColor(status?.state as string)}${status?.state}${colors.reset}`);
  } else if (event.statusUpdate) {
    const update = event.statusUpdate as Record<string, unknown>;
    const status = update.status as Record<string, unknown>;
    console.log(`${icons.arrow} ${colors.bold}Status${colors.reset} ${getStateColor(status.state as string)}${status.state}${colors.reset}`);
    if (status.message) {
      const msg = status.message as Record<string, unknown>;
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          const p = part as Record<string, unknown>;
          if (p.text) console.log(`  ${colors.dim}${p.text}${colors.reset}`);
        }
      }
    }
  } else if (event.artifactUpdate) {
    const update = event.artifactUpdate as Record<string, unknown>;
    const artifact = update.artifact as Record<string, unknown>;
    const label = update.append ? 'Artifact (chunk)' : 'Artifact';
    console.log(`${icons.arrow} ${colors.bold}${label}${colors.reset} ${artifact.artifactId || ''}`);
    if (Array.isArray(artifact.parts)) {
      for (const part of artifact.parts) {
        const p = part as Record<string, unknown>;
        if (p.text) {
          process.stdout.write(`${colors.dim}${p.text}${colors.reset}`);
        }
      }
    }
    if (update.lastChunk) console.log(`\n  ${colors.dim}[end of artifact]${colors.reset}`);
  } else if (event.message) {
    const msg = event.message as Record<string, unknown>;
    console.log(`${icons.info} ${colors.bold}Message${colors.reset} (${msg.role})`);
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>;
        if (p.text) console.log(`  ${p.text}`);
      }
    }
  }
}

export function printError(message: string, detail?: string) {
  console.error(`\n${icons.fail} ${colors.red}${colors.bold}Error:${colors.reset} ${message}`);
  if (detail) {
    console.error(`  ${colors.dim}${detail}${colors.reset}`);
  }
  console.log('');
}

export function printSuccess(message: string) {
  console.log(`${icons.pass} ${colors.green}${message}${colors.reset}`);
}

function formatBool(value: unknown): string {
  if (value === true) return `${colors.green}yes${colors.reset}`;
  if (value === false) return `${colors.dim}no${colors.reset}`;
  return `${colors.dim}not specified${colors.reset}`;
}

function getResultIcon(result: TestResult): string {
  switch (result) {
    case 'pass': return icons.pass;
    case 'fail': return icons.fail;
    case 'warn': return icons.warn;
    case 'skip': return icons.skip;
  }
}

function getStateColor(state: string | undefined): string {
  if (!state) return '';
  if (state.includes('COMPLETED')) return colors.green;
  if (state.includes('FAILED') || state.includes('CANCELED') || state.includes('REJECTED')) return colors.red;
  if (state.includes('WORKING') || state.includes('SUBMITTED')) return colors.cyan;
  if (state.includes('INPUT_REQUIRED') || state.includes('AUTH_REQUIRED')) return colors.yellow;
  return '';
}
