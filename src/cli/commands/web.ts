import { Command } from 'commander';
import { WebUIServer } from '../../web/server';
import { printBanner, printSuccess, printError } from '../../reporters/console';

export function registerWebCommand(program: Command) {
  program
    .command('web')
    .description('Launch the browser-based Web UI for A2A testing')
    .option('-p, --port <port>', 'Port to listen on', '8080')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .action(async (opts) => {
      printBanner();

      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        printError('Invalid port number', 'Must be between 1 and 65535');
        process.exit(1);
      }

      const server = new WebUIServer({ port, host: opts.host });

      try {
        await server.start();
        printSuccess(`Web UI running at ${server.url}`);
        console.log('');
        console.log('  Open in your browser:');
        console.log(`    ${server.url}`);
        console.log('');
        console.log('  The Web UI proxies requests to any A2A agent.');
        console.log('  Enter an agent URL in the browser and start testing.');
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
        printError('Could not start Web UI', message);
        process.exit(1);
      }
    });
}
