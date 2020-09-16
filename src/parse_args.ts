import { program } from 'commander';

program
  /* eslint-disable @typescript-eslint/no-var-requires */
  .version(require('../package.json').version)
  .usage('[options] <file>')
  .option('-s, --suite-params <jsonstring>', 'Variables', '{}')
  .option('-e, --environment <envname>', 'e.g. production', 'development')
  .option('-j, --json', 'output newline delimited JSON')
  .option('--stdin', 'read script file input from stdin')
  .option('-d, --debug', 'print debug information')
  .option('--no-headless', 'run browser in headful mode')
  .option(
    '--pause-on-error',
    'pause on error until a keypress is made in the console. Useful during development'
  )
  .option(
    '--screenshots',
    'take screenshots between steps (only shown in some reporters)'
  )
  .option('--network', 'capture all network information for all steps')
  .option('--metrics', 'capture performance metrics for each step')
  .option(
    '--dry-run',
    "don't actually execute anything, report as if each step was skipped"
  )
  .option('--journey-name <name>', 'only run the journey with the given name')
  .option(
    '--outfd <fd>',
    'specify a file descriptor number for output. Default is stdout',
    parseInt
  )
  .description('Run synthetic tests');

export const parseArgs = () => {
  program.parse(process.argv);
  return program;
};
