import type { SyntheticsConfig } from '@elastic/synthetics';
// import { paramsFromEnv } from '@elastic/synthetics';

export default env => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://elastic.github.io/synthetics-demo/',
      // Base URL for the API journey examples; replace with your service.
      apiUrl: 'https://jsonplaceholder.typicode.com',
      // Params can also be read from environment variables. Missing required
      // variables throw at config load; list optional ones in the options:
      // ...paramsFromEnv(['USER_EMAIL', 'USER_PASSWORD'], {
      //   optional: ['API_URL'],
      // }),
    },
    playwrightOptions: {
      ignoreHTTPSErrors: false,
    },
    /**
     * Configure global monitor settings
     */
    monitor: {
      schedule: '{{schedule}}',
      locations: ['{{locations}}'],
      privateLocations: ['{{privateLocations}}'],
    },
    /**
     * Project monitors settings
     */
    project: {
      id: '{{id}}',
      url: '{{url}}',
      space: '{{space}}',
    },
  };
  if (env !== 'development') {
    /**
     * Override configuration specific to environment
     * Ex: config.params.url = ""
     */
  }
  return config;
};
