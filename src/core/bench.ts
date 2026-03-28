import { A2AClient, ClientOptions } from './client';

export interface BenchOptions {
  /** Number of concurrent workers */
  concurrency: number;
  /** Duration in seconds */
  duration: number;
  /** Message text to send */
  message: string;
  /** Protocol binding */
  binding: 'HTTP+JSON' | 'JSONRPC';
  /** Auth token */
  authorization?: string;
  /** mTLS options */
  mtls?: { cert: string; key: string; ca?: string };
  /** Called periodically with live stats */
  onProgress?: (stats: BenchSnapshot) => void;
}

export interface BenchSnapshot {
  elapsed: number;
  requests: number;
  successes: number;
  failures: number;
  /** Latencies in ms for completed requests */
  latencies: number[];
}

export interface BenchReport {
  agentUrl: string;
  concurrency: number;
  duration: number;
  totalRequests: number;
  successes: number;
  failures: number;
  errorRate: number;
  throughput: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  errors: Record<string, number>;
}

export async function runBenchmark(
  baseUrl: string,
  opts: BenchOptions,
): Promise<BenchReport> {
  const clientOpts: ClientOptions = {
    baseUrl,
    binding: opts.binding,
    authorization: opts.authorization,
    timeout: 30000,
    mtls: opts.mtls,
  };

  const latencies: number[] = [];
  let successes = 0;
  let failures = 0;
  const errorCounts: Record<string, number> = {};
  let running = true;

  const durationMs = opts.duration * 1000;
  const startTime = Date.now();

  // Progress reporting interval
  const progressInterval = opts.onProgress
    ? setInterval(() => {
        opts.onProgress!({
          elapsed: Date.now() - startTime,
          requests: successes + failures,
          successes,
          failures,
          latencies: [...latencies],
        });
      }, 1000)
    : null;

  async function worker(): Promise<void> {
    const client = new A2AClient(clientOpts);
    while (running) {
      const req = client.createTextMessage(opts.message);
      const t0 = performance.now();
      try {
        await client.sendMessage(req);
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        successes++;
      } catch (err: unknown) {
        failures++;
        const key = err instanceof Error ? err.message.substring(0, 80) : 'Unknown';
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: opts.concurrency }, () => worker());

  // Wait for duration
  await new Promise<void>((resolve) => setTimeout(() => { running = false; resolve(); }, durationMs));

  // Wait for in-flight requests to finish (with a short grace period)
  await Promise.race([
    Promise.allSettled(workers),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);

  if (progressInterval) clearInterval(progressInterval);

  const totalRequests = successes + failures;
  const actualDuration = (Date.now() - startTime) / 1000;

  // Compute latency percentiles
  latencies.sort((a, b) => a - b);
  const pct = (p: number) => {
    if (latencies.length === 0) return 0;
    const idx = Math.ceil((p / 100) * latencies.length) - 1;
    return Math.round(latencies[Math.max(0, idx)] * 100) / 100;
  };
  const mean = latencies.length > 0
    ? Math.round((latencies.reduce((s, v) => s + v, 0) / latencies.length) * 100) / 100
    : 0;

  return {
    agentUrl: baseUrl,
    concurrency: opts.concurrency,
    duration: opts.duration,
    totalRequests,
    successes,
    failures,
    errorRate: totalRequests > 0 ? Math.round((failures / totalRequests) * 10000) / 100 : 0,
    throughput: Math.round((totalRequests / actualDuration) * 100) / 100,
    latency: {
      min: pct(0),
      max: latencies.length > 0 ? Math.round(latencies[latencies.length - 1] * 100) / 100 : 0,
      mean,
      median: pct(50),
      p95: pct(95),
      p99: pct(99),
    },
    errors: errorCounts,
  };
}
