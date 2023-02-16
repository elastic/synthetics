import type { SyntheticsConfig } from '../../../src';

module.exports = () => {
  const config: SyntheticsConfig = {
    params: {
      url: 'dev',
    },
    matrix: {
      // values: {
      //   url: ['https://elastic.github.io/synthetics-demo/'],
      //   assertion: ['test', 'test-2']
      // }
      adjustments: [{
        name: 'badssl failing',
        url: 'https://expired.badssl.com/',
        assertion: 'expired',
        playwrightOptions: {
          ignoreHTTPSErrors: false,
        }
      }, {
        name: 'badssl passing',
        url: 'https://expired.badssl.com/',
        assertion: 'expired',
        playwrightOptions: {
          ignoreHTTPSErrors: true,
        }
      }]
    }
  };
  return config;
};
