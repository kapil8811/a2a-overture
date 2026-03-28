import { Command } from 'commander';
import { runInteropSuite } from '../../core/compliance/interop';
import { printBanner, printError } from '../../reporters/console';
import { ComplianceTestResult } from '../../core/types';

export function registerInteropCommand(program: Command) {
  program
    .command('interop <urls...>')
    .description('Test multi-agent interoperability between 2+ A2A agents')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
    .option('--json', 'Output as JSON report', false)
    .action(async (urls: string[], opts: {
      binding: string;
      auth?: string;
      timeout: string;
      json: boolean;
    }) => {
      if (urls.length < 2) {
        printError('Interop test requires at least 2 agent URLs', 'Usage: overture interop <url1> <url2> [url3...]');
        process.exit(1);
      }

      if (!opts.json) {
        printBanner();
        console.log(`Multi-agent interop test: ${urls.length} agents\n`);
        for (const url of urls) {
          console.log(`  \x1b[36m→\x1b[0m ${url}`);
        }
        console.log('');
      }

      try {
        const report = await runInteropSuite(urls, {
          clientDefaults: {
            binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
            authorization: opts.auth,
            timeout: parseInt(opts.timeout, 10) || 30000,
          },
          onTestComplete: opts.json ? undefined : (result: ComplianceTestResult) => {
            const icon = result.result === 'pass' ? '\x1b[32m✔\x1b[0m'
              : result.result === 'fail' ? '\x1b[31m✖\x1b[0m'
              : result.result === 'warn' ? '\x1b[33m⚠\x1b[0m'
              : '\x1b[2m○\x1b[0m';
            process.stdout.write(`  ${icon} ${result.name}${result.duration ? ` \x1b[2m(${result.duration}ms)\x1b[0m` : ''}\n`);
          },
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('');
          printInteropReport(report);
        }

        process.exit(report.summary.failed > 0 ? 1 : 0);
      } catch (err) {
        printError('Interop test failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function printInteropReport(report: ReturnType<typeof import('../../core/compliance/interop').runInteropSuite> extends Promise<infer R> ? R : never) {
  const { summary, agents, duration, tests } = report;
  const colors = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
    bgRed: '\x1b[41m', bgGreen: '\x1b[42m', white: '\x1b[37m',
  };

  console.log(`${colors.bold}Interop Report${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  Agents:   ${agents.map(a => a.name || a.url).join(', ')}`);
  console.log(`  Time:     ${report.timestamp}`);
  console.log(`  Duration: ${duration}ms`);
  console.log('');

  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((passRate / 100) * barLen);
  console.log(`  ${colors.green}${'█'.repeat(filled)}${colors.red}${'█'.repeat(barLen - filled)}${colors.reset} ${passRate}%`);
  console.log(`  ${colors.green}✔${colors.reset} ${summary.passed} passed  ${colors.red}✖${colors.reset} ${summary.failed} failed  ${colors.yellow}⚠${colors.reset} ${summary.warnings} warnings  ${colors.dim}○${colors.reset} ${summary.skipped} skipped`);
  console.log('');

  console.log(`  ${colors.bold}Tests${colors.reset}`);
  for (const test of tests) {
    const icon = test.result === 'pass' ? `${colors.green}✔${colors.reset}`
      : test.result === 'fail' ? `${colors.red}✖${colors.reset}`
      : test.result === 'warn' ? `${colors.yellow}⚠${colors.reset}`
      : `${colors.dim}○${colors.reset}`;
    const dur = test.duration ? ` ${colors.dim}(${test.duration}ms)${colors.reset}` : '';
    console.log(`    ${icon} ${test.name}${dur}`);
    if (test.result === 'fail' && test.message) {
      console.log(`      ${colors.red}${test.message}${colors.reset}`);
    }
    if (test.result === 'warn' && test.message) {
      console.log(`      ${colors.yellow}${test.message}${colors.reset}`);
    }
  }
  console.log('');

  if (summary.failed === 0) {
    console.log(`  ${colors.bgGreen}${colors.white}${colors.bold} PASS ${colors.reset} All agents interoperate successfully`);
  } else {
    console.log(`  ${colors.bgRed}${colors.white}${colors.bold} FAIL ${colors.reset} ${summary.failed} interop issue(s) found`);
  }
  console.log('');
}
