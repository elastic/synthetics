import SonicBoom from 'sonic-boom';
import { grey, cyan, dim, italic } from 'kleur/colors';
import { now } from '../helpers';

const defaultFd = process.stdout.fd;
let logger = new SonicBoom({ fd: defaultFd });
export const setLogger = (fd: number) => {
  if (fd && fd !== defaultFd) {
    logger = new SonicBoom({ fd });
  }
};

export function log(msg) {
  if (!process.env.DEBUG || !msg) {
    return;
  }
  if (typeof msg === 'object') {
    msg = JSON.stringify(msg);
  }
  const time = dim(cyan(`at ${parseInt(String(now()))} ms `));
  logger.write(time + italic(grey(msg)) + '\n');
}

export function flushLoggerSync() {
  logger.flushSync();
}
