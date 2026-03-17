import { Command } from 'commander';
import { validateAgentCard } from '../../core/validator';
import { printValidationResult, printError } from '../../reporters/console';
import { toJsonValidation } from '../../reporters/json';
import * as fs from 'fs';

export function registerValidateCommand(program: Command) {
  program
    .command('validate <source>')
    .description('Validate an Agent Card from a URL or local file')
    .option('--json', 'Output as JSON', false)
    .action(async (source: string, opts: { json: boolean }) => {
      try {
        let card: unknown;

        if (source.startsWith('http://') || source.startsWith('https://')) {
          const response = await fetch(source);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          card = await response.json();
        } else {
          const content = fs.readFileSync(source, 'utf-8');
          card = JSON.parse(content);
        }

        const result = validateAgentCard(card);

        if (opts.json) {
          console.log(toJsonValidation(result, card));
        } else {
          printValidationResult(result);
        }

        process.exit(result.valid ? 0 : 1);
      } catch (err) {
        printError('Validation failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
