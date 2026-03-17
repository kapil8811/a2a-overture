import { Command } from 'commander';
import { MockA2AServer } from '../../mock/server';
import { printBanner, printSuccess, printError } from '../../reporters/console';

export function registerMockCommand(program: Command) {
  program
    .command('mock')
    .description('Start a mock A2A agent server for testing')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .option('--name <name>', 'Agent name', 'Overture Mock Agent')
    .option('--description <desc>', 'Agent description', 'A mock A2A agent for testing and development')
    .option('--no-streaming', 'Disable streaming support')
    .option('--latency <ms>', 'Simulated response latency in milliseconds', '0')
    .option('--auth-token <token>', 'Require Bearer token authentication (e.g. --auth-token secret123)')
    .action(async (opts) => {
      printBanner();

      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        printError('Invalid port number', 'Must be between 1 and 65535');
        process.exit(1);
      }

      const server = new MockA2AServer({
        port,
        host: opts.host,
        name: opts.name,
        description: opts.description,
        streaming: opts.streaming,
        latency: parseInt(opts.latency, 10) || 0,
        authToken: opts.authToken,
      });

      try {
        await server.start();
        printSuccess(`Mock A2A agent running at ${server.url}`);
        console.log('');
        console.log('  Endpoints:');
        console.log(`    Agent Card:     ${server.url}/.well-known/agent-card.json`);
        console.log(`    Send Message:   POST ${server.url}/message:send`);
        console.log(`    Stream Message: POST ${server.url}/message:stream`);
        console.log(`    Get Task:       GET  ${server.url}/tasks/:id`);
        console.log(`    List Tasks:     GET  ${server.url}/tasks`);
        console.log(`    Cancel Task:    POST ${server.url}/tasks/:id:cancel`);
        console.log(`    JSON-RPC:       POST ${server.url}/`);
        if (opts.authToken) {
          console.log('');
          console.log(`  Auth:  Bearer token required (--auth-token set)`);
        }
        console.log('');
        console.log('  Try it:');
        console.log(`    overture discover ${server.url}`);
        console.log(`    overture send ${server.url} "Hello!"`);
        console.log(`    overture certify ${server.url}`);
        console.log('');
        console.log('  Press Ctrl+C to stop');

        const shutdown = () => {
          console.log('\n  Shutting down...');
          server.stop().then(() => process.exit(0));
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to start server';
        printError('Could not start mock server', message);
        process.exit(1);
      }
    });
}
