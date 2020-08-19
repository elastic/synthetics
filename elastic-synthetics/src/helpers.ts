import { blueBright } from 'chalk';

export function debug(message: string) {
    if (process.env.DEBUG) {
        process.stdout.write(blueBright(message + '\n'));
    }
}
