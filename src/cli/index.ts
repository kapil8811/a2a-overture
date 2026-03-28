import { Command } from 'commander';
import { registerDiscoverCommand } from './commands/discover';
import { registerValidateCommand } from './commands/validate';
import { registerSendCommand } from './commands/send';
import { registerTaskCommand } from './commands/task';
import { registerCertifyCommand } from './commands/certify';
import { registerMockCommand } from './commands/mock';
import { registerWebCommand } from './commands/web';
import { registerRegistryCommand } from './commands/registry';
import { registerInteropCommand } from './commands/interop';
import { registerBenchCommand } from './commands/bench';
import { registerInitCommand } from './commands/init';

export function createCli(): Command {
  const program = new Command();

  program
    .name('overture')
    .description('A2A Overture — The opening act for your A2A agents\n\nDiscover, test, and certify A2A protocol compliance.')
    .version('0.1.0');

  registerDiscoverCommand(program);
  registerValidateCommand(program);
  registerSendCommand(program);
  registerTaskCommand(program);
  registerCertifyCommand(program);
  registerMockCommand(program);
  registerWebCommand(program);
  registerRegistryCommand(program);
  registerInteropCommand(program);
  registerBenchCommand(program);
  registerInitCommand(program);

  return program;
}
