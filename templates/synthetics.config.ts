import type { SyntheticsConfig } from '@elastic/synthetics';

export default env => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://example.com',
    },
    playwrightOptions: {
      ignoreHTTPSErrors: false,
    },
  };
  if (env !== 'development') {
    // Override configuration specific to environment
    config.params.url = 'https://example.org';
  }
  return config;
};
