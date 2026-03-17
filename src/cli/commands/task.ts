import { Command } from 'commander';
import { A2AClient } from '../../core/client';
import { printTaskSummary, printError } from '../../reporters/console';

export function registerTaskCommand(program: Command) {
  const taskCmd = program
    .command('task')
    .description('Manage A2A tasks');

  taskCmd
    .command('get <url> <taskId>')
    .description('Get the current state of a task')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--history <length>', 'Number of history messages to include', parseInt)
    .option('--json', 'Output raw JSON', false)
    .action(async (url: string, taskId: string, opts: {
      binding: string;
      auth?: string;
      history?: number;
      json: boolean;
    }) => {
      try {
        const client = new A2AClient({
          baseUrl: url,
          binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
          authorization: opts.auth,
        });

        const task = await client.getTask(taskId, opts.history);

        if (opts.json) {
          console.log(JSON.stringify(task, null, 2));
        } else {
          printTaskSummary(task as unknown as Record<string, unknown>);
        }
      } catch (err) {
        printError('Failed to get task', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  taskCmd
    .command('list <url>')
    .description('List tasks from an A2A agent')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--context <id>', 'Filter by context ID')
    .option('--status <state>', 'Filter by task state')
    .option('--limit <n>', 'Max results', parseInt)
    .option('--json', 'Output raw JSON', false)
    .action(async (url: string, opts: {
      binding: string;
      auth?: string;
      context?: string;
      status?: string;
      limit?: number;
      json: boolean;
    }) => {
      try {
        const client = new A2AClient({
          baseUrl: url,
          binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
          authorization: opts.auth,
        });

        const response = await client.listTasks({
          contextId: opts.context,
          status: opts.status as any,
          pageSize: opts.limit,
        });

        if (opts.json) {
          console.log(JSON.stringify(response, null, 2));
        } else {
          const r = response as unknown as Record<string, unknown>;
          const tasks = (r.tasks || []) as Record<string, unknown>[];
          console.log(`Found ${r.totalSize || tasks.length} task(s)\n`);
          for (const task of tasks) {
            printTaskSummary(task);
          }
        }
      } catch (err) {
        printError('Failed to list tasks', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  taskCmd
    .command('cancel <url> <taskId>')
    .description('Cancel an in-progress task')
    .option('--binding <type>', 'Protocol binding: HTTP+JSON or JSONRPC', 'HTTP+JSON')
    .option('--auth <token>', 'Authorization header value')
    .option('--json', 'Output raw JSON', false)
    .action(async (url: string, taskId: string, opts: {
      binding: string;
      auth?: string;
      json: boolean;
    }) => {
      try {
        const client = new A2AClient({
          baseUrl: url,
          binding: opts.binding as 'HTTP+JSON' | 'JSONRPC',
          authorization: opts.auth,
        });

        const task = await client.cancelTask(taskId);

        if (opts.json) {
          console.log(JSON.stringify(task, null, 2));
        } else {
          printTaskSummary(task as unknown as Record<string, unknown>);
        }
      } catch (err) {
        printError('Failed to cancel task', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
