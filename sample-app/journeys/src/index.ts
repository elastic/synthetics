// Do not remove line below!
import { run } from  'elastic-synthetics';
import { spawn } from 'child_process';

// Import your test files here
import './test.journey';

// Default parameters for running the suite. These can be overriden with the '--suite-params' option'
// customize these as you like!
const defaultSuiteParams = {
    development: {
        homepage: "http://localhost:4567"
    },
    staging: {
        homepage: "http://staging.localhost:4567"
    },
    production: {
        homepage: "http://prod.localhost:4567"
    }
}

// Code to run before and after the full suite
// By default you shouldn't need to edit this,
// simply edit 'start_service.sh' to start your service(s)
// This will run that, and send a SIGTERM after the
// suite is over
async function aroundSuite(runSuite: (suiteParams: any) => void, env: string, argSuiteParams: any) {
    const suiteParams = {...defaultSuiteParams[env], ...argSuiteParams};
    // By default we run the script start_test_target.sh
    const process = spawn('./start_service.sh');
    await runSuite(suiteParams);
    process.kill("SIGTERM");
}

// Do not remove below this line!
(async function r() {
    await run(aroundSuite);
})()