import { Command } from 'commander';
import { runBenchmark, BenchReport } from '../../core/bench';
import { printBanner, printError } from '../../reporters/console';

export function registerBenchCommand(program: Command) {
  program
    .command('bench <url>')
    .description('Performance benchmark an A2A agent — latency, throughput, error rate')
    .option('--concurrency <n>', 'Number of concurrent workers', '10')
    .option('--duration <seconds>', 'Test duration in seconds', '30')
    .option('--message <text>', 'Message to send each request', 'Hello')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--mtls-cert <file>', 'Client certificate file for mTLS')
    .option('--mtls-key <file>', 'Client private key file for mTLS')
    .option('--mtls-ca <file>', 'CA certificate file for mTLS')
    .option('--json', 'Output as JSON', false)
    .action(async (url: string, opts: {
      concurrency: string;
      duration: string;
      message: string;
      binding: string;
      auth?: string;
      mtlsCert?: string;
      mtlsKey?: string;
      mtlsCa?: string;
      json: boolean;
    }) => {
      const concurrency = parseInt(opts.concurrency, 10) || 10;
      const duration = parseInt(opts.duration, 10) || 30;

      if (!opts.json) {
        printBanner();
        console.log(`Benchmarking: ${url}`);
        console.log(`Concurrency: ${concurrency} | Duration: ${duration}s | Binding: ${opts.binding}\n`);
      }

      try {
        const report = await runBenchmark(url, {
          concurrency,
          duration,
          message: opts.message,
          binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
          authorization: opts.auth,
          mtls: opts.mtlsCert && opts.mtlsKey
            ? { cert: opts.mtlsCert, key: opts.mtlsKey, ca: opts.mtlsCa }
            : undefined,
          onProgress: opts.json ? undefined : (snap) => {
            const rps = snap.elapsed > 0 ? Math.round((snap.requests / (snap.elapsed / 1000)) * 10) / 10 : 0;
            process.stdout.write(
              `\r  ⏱  ${Math.round(snap.elapsed / 1000)}s  |  ${snap.requests} reqs  |  ${rps} req/s  |  ✔ ${snap.successes}  ✖ ${snap.failures}  `,
            );
          },
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          printBenchReport(report);
        }
      } catch (err) {
        printError('Benchmark failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function printBenchReport(r: BenchReport): void {
  const bar = (label: string, value: string) =>
    `  \x1b[2m${label.padEnd(16)}\x1b[0m ${value}`;

  console.log('\x1b[36m── Results ─────────────────────────────────\x1b[0m');
  console.log(bar('Total Requests', String(r.totalRequests)));
  console.log(bar('Successes', `\x1b[32m${r.successes}\x1b[0m`));
  console.log(bar('Failures', r.failures > 0 ? `\x1b[31m${r.failures}\x1b[0m` : '0'));
  console.log(bar('Error Rate', r.errorRate > 0 ? `\x1b[31m${r.errorRate}%\x1b[0m` : `\x1b[32m${r.errorRate}%\x1b[0m`));
  console.log(bar('Throughput', `\x1b[33m${r.throughput} req/s\x1b[0m`));
  console.log('');
  console.log('\x1b[36m── Latency ─────────────────────────────────\x1b[0m');
  console.log(bar('Min', `${r.latency.min}ms`));
  console.log(bar('Mean', `${r.latency.mean}ms`));
  console.log(bar('Median (p50)', `${r.latency.median}ms`));
  console.log(bar('p95', `${r.latency.p95}ms`));
  console.log(bar('p99', `${r.latency.p99}ms`));
  console.log(bar('Max', `${r.latency.max}ms`));

  if (Object.keys(r.errors).length > 0) {
    console.log('');
    console.log('\x1b[36m── Errors ──────────────────────────────────\x1b[0m');
    for (const [msg, count] of Object.entries(r.errors)) {
      console.log(`  \x1b[31m${count}x\x1b[0m ${msg}`);
    }
  }
  console.log('');
}
