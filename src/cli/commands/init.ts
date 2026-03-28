import { Command } from 'commander';
import { scaffoldAgent, SdkLanguage } from '../../core/scaffold';
import { printBanner, printError } from '../../reporters/console';
import * as path from 'path';

const SUPPORTED_SDKS: SdkLanguage[] = ['python', 'typescript', 'go'];

export function registerInitCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Scaffold a new A2A-compliant agent project')
    .option('--sdk <language>', 'SDK language: python, typescript, go', 'python')
    .option('--name <name>', 'Agent name', 'my-a2a-agent')
    .option('--description <desc>', 'Agent description', 'An A2A-compliant agent')
    .option('--port <port>', 'Server port', '3000')
    .action(async (directory: string | undefined, opts: {
      sdk: string;
      name: string;
      description: string;
      port: string;
    }) => {
      printBanner();

      const sdk = opts.sdk.toLowerCase() as SdkLanguage;
      if (!SUPPORTED_SDKS.includes(sdk)) {
        printError('Unsupported SDK', `"${opts.sdk}" is not supported. Choose from: ${SUPPORTED_SDKS.join(', ')}`);
        process.exit(1);
      }

      const outDir = directory || opts.name;
      const port = parseInt(opts.port, 10) || 3000;

      console.log(`Scaffolding ${sdk} agent: ${opts.name}`);
      console.log(`Output: ${path.resolve(outDir)}\n`);

      try {
        const files = scaffoldAgent({
          sdk,
          name: opts.name,
          description: opts.description,
          port,
          outDir,
        });

        for (const f of files) {
          const rel = path.relative(path.resolve(outDir), f);
          console.log(`  \x1b[32m✔\x1b[0m ${rel}`);
        }

        console.log(`\n\x1b[32m✔\x1b[0m Agent scaffolded successfully!\n`);
        console.log('Next steps:');

        switch (sdk) {
          case 'python':
            console.log(`  cd ${outDir}`);
            console.log('  pip install -e .');
            console.log('  python agent.py');
            break;
          case 'typescript':
            console.log(`  cd ${outDir}`);
            console.log('  npm install');
            console.log('  npm run dev');
            break;
          case 'go':
            console.log(`  cd ${outDir}`);
            console.log('  go run main.go');
            break;
        }

        console.log(`\nThen verify compliance:`);
        console.log(`  npx a2a-overture certify http://localhost:${port}\n`);
      } catch (err) {
        printError('Scaffold failed', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
