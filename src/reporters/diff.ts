import { ComplianceReport, ComplianceTestResult, TestResult } from '../core/types';

export interface DiffEntry {
  testId: string;
  testName: string;
  before: TestResult;
  after: TestResult;
  change: 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed';
  messageBefore?: string;
  messageAfter?: string;
}

export interface ComplianceReportDiff {
  agentUrl: string;
  agentNameBefore?: string;
  agentNameAfter?: string;
  timestampBefore: string;
  timestampAfter: string;
  summaryBefore: ComplianceReport['summary'];
  summaryAfter: ComplianceReport['summary'];
  entries: DiffEntry[];
  regressions: number;
  improvements: number;
  newTests: number;
  removedTests: number;
}

const resultRank: Record<TestResult, number> = {
  pass: 3,
  warn: 2,
  skip: 1,
  fail: 0,
};

/**
 * Compare two compliance reports and produce a structured diff.
 */
export function diffReports(before: ComplianceReport, after: ComplianceReport): ComplianceReportDiff {
  const beforeMap = new Map<string, ComplianceTestResult>();
  for (const t of before.tests) {
    beforeMap.set(t.id, t);
  }

  const afterMap = new Map<string, ComplianceTestResult>();
  for (const t of after.tests) {
    afterMap.set(t.id, t);
  }

  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const entries: DiffEntry[] = [];

  for (const id of allIds) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);

    if (b && a) {
      const bRank = resultRank[b.result];
      const aRank = resultRank[a.result];
      const change = aRank > bRank ? 'improved' : aRank < bRank ? 'regressed' : 'unchanged';
      entries.push({
        testId: id,
        testName: a.name,
        before: b.result,
        after: a.result,
        change,
        messageBefore: b.message,
        messageAfter: a.message,
      });
    } else if (a && !b) {
      entries.push({
        testId: id,
        testName: a.name,
        before: 'skip',
        after: a.result,
        change: 'new',
        messageAfter: a.message,
      });
    } else if (b && !a) {
      entries.push({
        testId: id,
        testName: b.name,
        before: b.result,
        after: 'skip',
        change: 'removed',
        messageBefore: b.message,
      });
    }
  }

  // Sort: regressions first, then improvements, then unchanged, new, removed
  const changeOrder: Record<string, number> = { regressed: 0, improved: 1, new: 2, removed: 3, unchanged: 4 };
  entries.sort((a, b) => (changeOrder[a.change] ?? 5) - (changeOrder[b.change] ?? 5));

  return {
    agentUrl: after.agentUrl || before.agentUrl,
    agentNameBefore: before.agentName,
    agentNameAfter: after.agentName,
    timestampBefore: before.timestamp,
    timestampAfter: after.timestamp,
    summaryBefore: before.summary,
    summaryAfter: after.summary,
    entries,
    regressions: entries.filter(e => e.change === 'regressed').length,
    improvements: entries.filter(e => e.change === 'improved').length,
    newTests: entries.filter(e => e.change === 'new').length,
    removedTests: entries.filter(e => e.change === 'removed').length,
  };
}

/**
 * Format report diff as JSON.
 */
export function toDiffJson(diff: ComplianceReportDiff): string {
  return JSON.stringify(diff, null, 2);
}

/**
 * Print report diff to console with ANSI colors.
 */
export function printDiffReport(diff: ComplianceReportDiff): void {
  const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
    magenta: '\x1b[35m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m', white: '\x1b[37m',
  };

  console.log(`${c.bold}Compliance Diff Report${c.reset}`);
  console.log('─'.repeat(50));
  console.log(`  Agent:  ${diff.agentNameAfter || diff.agentUrl}`);
  console.log(`  Before: ${diff.timestampBefore}`);
  console.log(`  After:  ${diff.timestampAfter}`);
  console.log('');

  // Summary comparison
  const sb = diff.summaryBefore;
  const sa = diff.summaryAfter;
  console.log(`  ${c.bold}Summary${c.reset}`);
  console.log(`    Passed:   ${sb.passed} → ${formatDelta(sb.passed, sa.passed, c)}`);
  console.log(`    Failed:   ${sb.failed} → ${formatDelta(sb.failed, sa.failed, c, true)}`);
  console.log(`    Warnings: ${sb.warnings} → ${formatDelta(sb.warnings, sa.warnings, c, true)}`);
  console.log(`    Skipped:  ${sb.skipped} → ${formatDelta(sb.skipped, sa.skipped, c)}`);
  console.log(`    Total:    ${sb.total} → ${sa.total}`);
  console.log('');

  // Regressions
  if (diff.regressions > 0) {
    console.log(`  ${c.red}${c.bold}Regressions (${diff.regressions})${c.reset}`);
    for (const e of diff.entries.filter(e => e.change === 'regressed')) {
      console.log(`    ${c.red}✖${c.reset} ${e.testName}: ${resultLabel(e.before, c)} → ${resultLabel(e.after, c)}`);
      if (e.messageAfter) console.log(`      ${c.dim}${e.messageAfter}${c.reset}`);
    }
    console.log('');
  }

  // Improvements
  if (diff.improvements > 0) {
    console.log(`  ${c.green}${c.bold}Improvements (${diff.improvements})${c.reset}`);
    for (const e of diff.entries.filter(e => e.change === 'improved')) {
      console.log(`    ${c.green}✔${c.reset} ${e.testName}: ${resultLabel(e.before, c)} → ${resultLabel(e.after, c)}`);
    }
    console.log('');
  }

  // New tests
  if (diff.newTests > 0) {
    console.log(`  ${c.cyan}${c.bold}New Tests (${diff.newTests})${c.reset}`);
    for (const e of diff.entries.filter(e => e.change === 'new')) {
      console.log(`    ${c.cyan}+${c.reset} ${e.testName}: ${resultLabel(e.after, c)}`);
    }
    console.log('');
  }

  // Removed tests
  if (diff.removedTests > 0) {
    console.log(`  ${c.magenta}${c.bold}Removed Tests (${diff.removedTests})${c.reset}`);
    for (const e of diff.entries.filter(e => e.change === 'removed')) {
      console.log(`    ${c.magenta}-${c.reset} ${e.testName}: was ${resultLabel(e.before, c)}`);
    }
    console.log('');
  }

  // Final verdict
  if (diff.regressions === 0) {
    console.log(`  ${c.bgGreen}${c.white}${c.bold} NO REGRESSIONS ${c.reset} ${diff.improvements > 0 ? `${diff.improvements} improvement(s)` : 'No changes'}`);
  } else {
    console.log(`  ${c.bgRed}${c.white}${c.bold} ${diff.regressions} REGRESSION(S) ${c.reset} Agent compliance has degraded`);
  }
  console.log('');
}

function formatDelta(before: number, after: number, c: Record<string, string>, invertColors = false): string {
  const delta = after - before;
  if (delta === 0) return `${after}`;
  const positive = delta > 0;
  const color = (positive && !invertColors) || (!positive && invertColors) ? c.green : c.red;
  return `${after} ${color}(${positive ? '+' : ''}${delta})${c.reset}`;
}

function resultLabel(result: TestResult, c: Record<string, string>): string {
  switch (result) {
    case 'pass': return `${c.green}pass${c.reset}`;
    case 'fail': return `${c.red}fail${c.reset}`;
    case 'warn': return `${c.yellow}warn${c.reset}`;
    case 'skip': return `${c.dim}skip${c.reset}`;
  }
}
