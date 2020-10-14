import { spawn, ChildProcess } from 'child_process';
import { default as axios } from 'axios';
import { exit } from 'process';

// Default parameters for running the suite. These can be overriden with the '--suite-params' option'
// customize these as you like!
const defaultSuiteParams = {
  development: {
    homepage: 'http://localhost:4567',
  },
  staging: {
    homepage: 'http://staging.localhost:4567',
  },
  production: {
    homepage: 'http://prod.localhost:4567',
  },
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

/**
 * Starts the ruby app in dev environment by spawning a
 * child process
 */
export async function startApp() {
  const environment = process.env['NODE_ENV'] || 'development';
  console.log(`Test suite env: ${environment}`);
  const suiteParams = { ...defaultSuiteParams[environment] };
  let childProcess: ChildProcess;
  if (environment === 'development') {
    console.log('Starting service from `./hooks/start_service.sh`');
    childProcess = spawn('./hooks/start_service.sh', {
      stdio: 'pipe',
    });
    childProcess.on('close', code => {
      console.debug(`child process for service exited with ${code}`);
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
  return childProcess;
}
