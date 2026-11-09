/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { IncomingHttpHeaders } from 'http';
import { journey, runner, monitor } from '../../src/core';
import { Gatherer } from '../../src/core/gatherer';
import { NetworkManager } from '../../src/plugins';
import {
  Apm,
  BAGGAGE_HEADER,
  generateBaggageHeader,
  mergeBaggage,
} from '../../src/plugins/apm';
import { Server } from '../utils/server';
import { wsEndpoint } from '../utils/test-config';

describe('apm', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('propagate http header', async () => {
    runner.addJourney(journey('j1', () => {}));
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    const network = new NetworkManager(driver);
    const apm = new Apm(driver, { traceUrls: ['**/*'] });
    await network.start();
    await apm.start();
    // visit test page
    await driver.page.goto(server.TEST_PAGE);
    await apm.stop();
    const [htmlReq] = await network.stop();
    await Gatherer.stop();

    expect(htmlReq.request.headers[BAGGAGE_HEADER]).toBe(
      `synthetics.monitor.id=j1`
    );
  });

  it('stops propagating headers once stopped', async () => {
    runner.addJourney(journey('j1', () => {}));
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    const network = new NetworkManager(driver);
    const apm = new Apm(driver, { traceUrls: ['**/*'] });
    await network.start();
    await apm.start();
    await apm.stop();
    await driver.page.goto(server.TEST_PAGE);
    const [htmlReq] = await network.stop();
    await Gatherer.stop();

    expect(htmlReq.request.headers[BAGGAGE_HEADER]).toBeUndefined();
  });

  it('keeps the trace context the page already sends', async () => {
    runner.addJourney(journey('j1', () => {}));
    let received: IncomingHttpHeaders = {};
    server.route('/echo', (req, res) => {
      received = req.headers;
      res.end('ok');
    });
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    const apm = new Apm(driver, { traceUrls: ['**/echo'] });
    await apm.start();
    await driver.page.goto(server.TEST_PAGE);
    // what an instrumented page (RUM / OTel SDK) sends on its own requests
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const tracestate = 'othervendor=opaque,es=s:0.1';
    await driver.page.evaluate(
      ([url, traceparent, tracestate]) =>
        fetch(url, {
          headers: { baggage: 'app.user=42', traceparent, tracestate },
        }),
      [`${server.PREFIX}/echo`, traceparent, tracestate]
    );
    await apm.stop();
    await Gatherer.stop();

    // our members are appended to the page's baggage...
    expect(received[BAGGAGE_HEADER]).toBe(
      'app.user=42,synthetics.monitor.id=j1'
    );
    // ...and the page stays the owner of the trace and its sampling decision
    expect(received['traceparent']).toBe(traceparent);
    expect(received['tracestate']).toBe(tracestate);
  });

  it('skips the baggage header without synthetics context', () => {
    expect(generateBaggageHeader(undefined)).toBe('');
  });

  it('merges baggage', () => {
    const ours = 'synthetics.trace.id=abc,synthetics.monitor.id=m1';
    expect(mergeBaggage(undefined, ours)).toBe(ours);
    expect(mergeBaggage('', ours)).toBe(ours);
    expect(mergeBaggage('app.user=42;prop=1, other=x', ours)).toBe(
      `app.user=42;prop=1,other=x,${ours}`
    );
    // our member wins on a duplicate key
    expect(mergeBaggage('synthetics.monitor.id=stale,app.user=42', ours)).toBe(
      `app.user=42,${ours}`
    );
  });

  it('baggage generation', () => {
    const j1 = journey('j1', () => {});
    monitor.use({ id: 'foo' });
    expect(generateBaggageHeader(j1)).toBe(`synthetics.monitor.id=foo`);

    // Set Checkgroup
    process.env['ELASTIC_SYNTHETICS_TRACE_ID'] = 'x-trace';
    process.env['ELASTIC_SYNTHETICS_MONITOR_ID'] = 'global-foo';
    process.env['ELASTIC_SYNTHETICS_MONITOR_TYPE'] = 'browser';
    process.env['ELASTIC_SYNTHETICS_MONITOR_LOCATION'] = 'us-east';
    // W3C baggage: comma-separated members, values percent-encoded
    expect(generateBaggageHeader(j1)).toBe(
      `synthetics.trace.id=x-trace,synthetics.monitor.id=global-foo,synthetics.monitor.type=browser,synthetics.monitor.location=us-east`
    );

    delete process.env['ELASTIC_SYNTHETICS_TRACE_ID'];
    delete process.env['ELASTIC_SYNTHETICS_MONITOR_ID'];
    delete process.env['ELASTIC_SYNTHETICS_MONITOR_TYPE'];
    delete process.env['ELASTIC_SYNTHETICS_MONITOR_LOCATION'];
  });
});
