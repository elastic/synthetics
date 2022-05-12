import type { SyntheticsConfig } from '@elastic/synthetics';

export default env => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://elastic.github.io/synthetics-demo/',
    },
    playwrightOptions: {
      ignoreHTTPSErrors: true,
    },
  };
  if (env !== 'development') {
    config.params.url = 'https://elastic.github.io/synthetics-demo/';
  }
  return config;
};
