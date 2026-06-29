import type { SyntheticsConfig } from '@elastic/synthetics';

export default env => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://elastic.github.io/synthetics-demo/',
      // Used by the API journey examples. jsonplaceholder is a free,
      // stable public test API — replace with your own service when
      // adapting these examples.
      apiUrl: 'https://jsonplaceholder.typicode.com',
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
