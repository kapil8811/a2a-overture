import { Command } from 'commander';
import { startRegistryServer } from '../../registry/server';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

export function registerRegistryCommand(program: Command) {
  const registry = program
    .command('registry')
    .description('Manage the A2A compliance registry');

  // ─── registry serve ────────────────────────────────────
  registry
    .command('serve')
    .description('Start the public compliance registry server')
    .option('--port <port>', 'Port to listen on', '3335')
    .option('--data-dir <dir>', 'Directory to store registry data', '.overture-registry')
    .action(async (opts: { port: string; dataDir: string }) => {
      startRegistryServer({
        port: parseInt(opts.port, 10),
        dataDir: path.resolve(opts.dataDir),
      });
    });

  // ─── registry publish ──────────────────────────────────
  registry
    .command('publish <file>')
    .description('Publish a compliance report to a registry')
    .option('--registry <url>', 'Registry URL', 'http://localhost:3335')
    .action(async (file: string, opts: { registry: string }) => {
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      const reportJson = fs.readFileSync(file, 'utf-8');

      // Validate it's actually a compliance report
      try {
        const parsed = JSON.parse(reportJson);
        if (!parsed.agentUrl || !parsed.tests) {
          console.error('File does not appear to be a valid compliance report');
          process.exit(1);
        }
      } catch {
        console.error('File is not valid JSON');
        process.exit(1);
      }

      const url = new URL('/api/entries', opts.registry);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(reportJson),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const result = JSON.parse(data);
            console.log(`✅ Published successfully!`);
            console.log(`   Entry ID:  ${result.id}`);
            console.log(`   Badge URL: ${opts.registry}${result.badgeUrl}`);
          } else {
            console.error(`Failed to publish (${res.statusCode}): ${data}`);
            process.exit(1);
          }
        });
      });

      req.on('error', (err) => {
        console.error(`Connection error: ${err.message}`);
        console.error(`Is the registry running at ${opts.registry}?`);
        process.exit(1);
      });

      req.write(reportJson);
      req.end();
    });

  // ─── registry list ─────────────────────────────────────
  registry
    .command('list')
    .description('List all entries in a registry')
    .option('--registry <url>', 'Registry URL', 'http://localhost:3335')
    .action(async (opts: { registry: string }) => {
      const url = new URL('/api/entries', opts.registry);
      const transport = url.protocol === 'https:' ? https : http;

      transport.get(url, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          const entries = JSON.parse(data);
          if (entries.length === 0) {
            console.log('No entries in registry.');
            return;
          }

          console.log(`\n${'─'.repeat(70)}`);
          console.log(`  A2A Overture Registry — ${entries.length} agent(s)`);
          console.log(`${'─'.repeat(70)}\n`);

          for (const entry of entries) {
            const r = entry.report;
            const passRate = r.summary.total > 0 ? Math.round((r.summary.passed / r.summary.total) * 100) : 0;
            const icon = r.summary.failed === 0 ? '✅' : '❌';
            console.log(`  ${icon} ${r.agentName || 'Unknown'} (${r.agentUrl})`);
            console.log(`     ${passRate}% — ${r.summary.passed}/${r.summary.total} passed | submitted ${new Date(entry.submittedAt).toLocaleDateString()}`);
            console.log('');
          }
        });
      }).on('error', (err) => {
        console.error(`Connection error: ${err.message}`);
        process.exit(1);
      });
    });
}
