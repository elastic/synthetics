import { program } from 'commander';

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { name, version } = require('../package.json');
program
  .name(name)
  .usage('[options] [dir] [files] file')
  .option('-s, --suite-params <jsonstring>', 'Variables', '{}')
  .option('-e, --environment <envname>', 'e.g. production', 'development')
  .option('-j, --json', 'output newline delimited JSON')
  .option('-d, --debug', 'print debug logs info')
  .option(
    '--pattern <pattern>',
    'RegExp file patterns to search inside directory'
  )
  .option('--inline', 'Run inline journeys from heartbeat')
  .option('-r, --require <modules...>', 'module(s) to preload')
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
    "don't actually execute anything, report only registered journeys"
  )
  .option('--journey-name <name>', 'only run the journey with the given name')
  .option(
    '--outfd <fd>',
    'specify a file descriptor for logs. Default is stdout',
    parseInt
  )
  .version(version)
  .description('Run synthetic tests');

export const parseArgs = () => {
  program.parse(process.argv);
  return program;
};
