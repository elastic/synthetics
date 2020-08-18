require('source-map-support').install();

export * from './dsl';
export * from './runner';

import { run } from './runner' ;

if (require.main === module)  {
    run()
}
