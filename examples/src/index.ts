import { run, program } from 'elastic-synthetics';
import { spawn, ChildProcess } from 'child_process';
import { default as axios } from 'axios';
import { exit } from 'process';

// Import your test files here
import './test.journey';

// Default parameters for running the suite. These can be overriden with the '--suite-params' option'
// customize these as you like!
const defaultSuiteParams = {
  development: {
    homepage: 'http://localhost:4567'
  },
  staging: {
    homepage: 'http://staging.localhost:4567'
  },
  production: {
    homepage: 'http://prod.localhost:4567'
  }
};

// Change the contents of this function to determine when the service you're testing is ready to run the suite
async function waitForApp(suiteParams: any) {
  const homepage = suiteParams.homepage;

  console.log(`Waiting for service homepage to come up: ${homepage}`);
  let timeout = 60000; // time in millis to wait for app to start
  let lastError;
  while (timeout > 0) {
    const started = new Date().getTime();
    try {
      const res = await axios.get(homepage);
      if (res.status >= 200 && res.status < 400) {
        // App is OK!
        return;
      }
      lastError = new Error(`Invalid status code: ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      const durationMs = new Date().getTime() - started;
      timeout -= durationMs;
    }
  }

  throw lastError;
}

// Code to run before and after the full suite
// By default you shouldn't need to edit this,
// simply edit 'start_service.sh' to start your service(s)
// This will run that, and send a SIGTERM after the
// suite is over
async function runSuites() {
  console.log(`Test suite env: ${program.environment}`)
  const environment = program.environment || 'development';
  const suiteParams = { ...defaultSuiteParams[environment] };
  // By default we run the script start_service.sh

  let childProcess: ChildProcess;
  if (environment === "development") {
    console.log("Starting service from `./start_service.sh`")
    const childProcess = spawn('./hooks/start_service.sh');
    childProcess.stdout.on('data', (chunk) => {
      console.log(chunk);
    });
    childProcess.stderr.on('data', (chunk) => {
      console.warn(chunk);
    });
    childProcess.on('close', (code) => {
      console.debug(`child process for service exited with ${code}`)
    });

    // Wait for the service to start successfully (you can change the logic here)
    try {
      await waitForApp(suiteParams);
    } catch (e) {
      console.error(
        'Service did not start successfully in time, failed waiting for initial service health check'
      );
      console.error(e);
      exit(123);
    }
  }

  // Run the actual test suite
  await run({ params: suiteParams, environment });

  // Clean up the script started with start_service.sh
  if (childProcess) {
    console.log("Terminating service with SIGTERM")
    childProcess.kill('SIGTERM');
  }
}

// Do not remove below this line!
(async () => {
  await runSuites();
})();
