import { Command } from 'commander';
import { A2AClient } from '../../core/client';
import { printAgentCard, printValidationResult, printError, printBanner } from '../../reporters/console';
import { validateAgentCard } from '../../core/validator';
import * as fs from 'fs';

export function registerDiscoverCommand(program: Command) {
  program
    .command('discover <url>')
    .description('Fetch and display an Agent Card from an A2A agent')
    .option('--card-url <url>', 'Override the Agent Card URL (default: <url>/.well-known/agent-card.json)')
    .option('--validate', 'Validate the Agent Card against the A2A spec', false)
    .option('--json', 'Output raw JSON', false)
    .option('--save <file>', 'Save the Agent Card to a file')
    .action(async (url: string, opts: { cardUrl?: string; validate: boolean; json: boolean; save?: string }) => {
      try {
        const client = new A2AClient({ baseUrl: url, binding: 'HTTP+JSON' });
        const card = await client.discoverAgentCard(opts.cardUrl);

        if (opts.json) {
          console.log(JSON.stringify(card, null, 2));
        } else {
          printAgentCard(card as unknown as Record<string, unknown>);
        }

        if (opts.validate) {
          const result = validateAgentCard(card);
          printValidationResult(result);
        }

        if (opts.save) {
          fs.writeFileSync(opts.save, JSON.stringify(card, null, 2), 'utf-8');
          console.log(`Agent Card saved to ${opts.save}`);
        }
      } catch (err) {
        printError('Failed to discover agent', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
