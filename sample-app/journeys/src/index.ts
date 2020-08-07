import { run } from  'elastic-synthetics';
import './test.journey';

(async function r() {
    await run();
})()