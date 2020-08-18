import 'source-map-support/register';
import { run } from './runner';

export * from './dsl';
export * from './runner';

if (require.main === module) {
    run();
}
