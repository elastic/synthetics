// note that `env` is the `env` argument passed to the synthetics program
// the default being `development`
export default env => {
  const cfg = {
    params: {
      url: 'http://localhost:8080',
    },
    playwrightOptions: {
      // Note, this is mostly equivalent to `...devices["iPhone 6"]` with import { devices } from 'playwright-chromium';
      // Just expanded for illustration
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
      viewport: {
        width: 375,
        height: 667,
      },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  };

  if (env === 'production') {
    cfg.params.url = 'https://elastic.github.io/synthetics-demo/';
  }

  return cfg;
};
