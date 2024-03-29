import type { SyntheticsConfig } from '@elastic/synthetics';

export default env => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://elastic.github.io/synthetics-demo/',
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
