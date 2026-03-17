import { Command } from 'commander';
import { runComplianceSuite } from '../../core/compliance/runner';
import { printBanner, printComplianceReport, printError } from '../../reporters/console';
import { toJsonReport } from '../../reporters/json';
import { generateBadgeSvg } from '../../reporters/badge';
import { generateHtmlReport } from '../../reporters/html';
import * as fs from 'fs';

export function registerCertifyCommand(program: Command) {
  program
    .command('certify <url>')
    .description('Run the full A2A compliance test suite against an agent')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--only <tests>', 'Comma-separated list of test IDs to run')
    .option('--skip <tests>', 'Comma-separated list of test IDs to skip')
    .option('--json', 'Output as JSON report', false)
    .option('--save <file>', 'Save the compliance report to a file')
    .option('--badge <file>', 'Generate an SVG compliance badge')
    .option('--html <file>', 'Generate a shareable HTML compliance report')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
    .action(async (url: string, opts: {
      binding: string;
      auth?: string;
      only?: string;
      skip?: string;
      json: boolean;
      save?: string;
      badge?: string;
      html?: string;
      timeout: string;
    }) => {
      if (!opts.json) {
        printBanner();
        console.log(`Testing: ${url}\n`);
      }

      try {
        const report = await runComplianceSuite(
          {
            baseUrl: url,
            binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
            authorization: opts.auth,
            timeout: parseInt(opts.timeout, 10) || 30000,
          },
          {
            testIds: opts.only?.split(',').map(s => s.trim()),
            skipIds: opts.skip?.split(',').map(s => s.trim()),
            onTestComplete: opts.json ? undefined : (result, index, total) => {
              const icon = result.result === 'pass' ? '\x1b[32m✔\x1b[0m'
                : result.result === 'fail' ? '\x1b[31m✖\x1b[0m'
                : result.result === 'warn' ? '\x1b[33m⚠\x1b[0m'
                : '\x1b[2m○\x1b[0m';
              process.stdout.write(`  ${icon} ${result.name}${result.duration ? ` \x1b[2m(${result.duration}ms)\x1b[0m` : ''}\n`);
            },
          },
        );

        if (opts.json) {
          console.log(toJsonReport(report));
        } else {
          console.log('');
          printComplianceReport(report);
        }

        if (opts.save) {
          fs.writeFileSync(opts.save, toJsonReport(report), 'utf-8');
          console.log(`Report saved to ${opts.save}`);
        }

        if (opts.badge) {
          const svg = generateBadgeSvg(report.summary);
          fs.writeFileSync(opts.badge, svg, 'utf-8');
          console.log(`Badge saved to ${opts.badge}`);
        }

        if (opts.html) {
          const html = generateHtmlReport(report);
          fs.writeFileSync(opts.html, html, 'utf-8');
          console.log(`HTML report saved to ${opts.html}`);
        }

        process.exit(report.summary.failed > 0 ? 1 : 0);
      } catch (err) {
        printError('Certification failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
