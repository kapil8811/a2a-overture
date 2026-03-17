import { Command } from 'commander';
import { A2AClient } from '../../core/client';
import { printTaskSummary, printStreamEvent, printError } from '../../reporters/console';

export function registerSendCommand(program: Command) {
  program
    .command('send <url> <message>')
    .description('Send a text message to an A2A agent')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value (e.g., "Bearer <token>")')
    .option('--task-id <id>', 'Continue an existing task')
    .option('--context-id <id>', 'Use a specific context ID')
    .option('--json', 'Output raw JSON response', false)
    .option('--stream', 'Use streaming mode', false)
    .action(async (url: string, message: string, opts: {
      binding: string;
      auth?: string;
      taskId?: string;
      contextId?: string;
      json: boolean;
      stream: boolean;
    }) => {
      try {
        const client = new A2AClient({
          baseUrl: url,
          binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
          authorization: opts.auth,
        });

        const request = client.createTextMessage(message, opts.taskId, opts.contextId);

        if (opts.stream) {
          console.log('Streaming response...\n');
          for await (const event of client.streamMessage(request)) {
            if (opts.json) {
              console.log(JSON.stringify(event, null, 2));
            } else {
              printStreamEvent(event as Record<string, unknown>);
            }
          }
          console.log('\nStream ended.');
        } else {
          const response = await client.sendMessage(request);

          if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
          } else {
            const r = response as Record<string, unknown>;
            if (r.task) {
              printTaskSummary(r.task as Record<string, unknown>);
            } else if (r.message) {
              const msg = r.message as Record<string, unknown>;
              console.log(`Agent response (${msg.role}):`);
              if (Array.isArray(msg.parts)) {
                for (const part of msg.parts) {
                  const p = part as Record<string, unknown>;
                  if (p.text) console.log(`  ${p.text}`);
                }
              }
            }
          }
        }
      } catch (err) {
        printError('Send failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
