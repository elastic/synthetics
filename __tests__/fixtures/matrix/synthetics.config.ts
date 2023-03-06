import type { SyntheticsConfig } from '../../../src';

module.exports = () => {
  const config: SyntheticsConfig = {
    params: {
      url: 'dev',
    },
    matrix: {
      adjustments: [{
        name: 'badssl failing',
        params: {
          url: 'https://expired.badssl.com/',
          assertion: 'expired',
        },
        playwrightOptions: {
          ignoreHTTPSErrors: false,
        }
      }, {
        name: 'badssl passing',
        params: {
          url: 'https://expired.badssl.com/',
          assertion: 'expired',
        },
        playwrightOptions: {
          ignoreHTTPSErrors: true,
        }
      }]
    }
  };
  return config;
};
