import { beforeAll, afterAll } from '@elastic/synthetics';
import { createServer, Server } from 'http';
import { Server as StaticServer } from 'node-static';

let srv: Server;

beforeAll(async () => {
  const loc = __dirname + '/app';
  const ss = new StaticServer(loc);

  return new Promise(isUp => {
    console.log(`Serving static app from ${loc}`);
    srv = createServer((req, res) => {
      req
        .addListener('end', () => {
          ss.serve(req, res);
        })
        .resume();
    }).listen(8080, undefined, undefined, () => {
      isUp();
    });
  });
});

afterAll(async () => {
  if (srv) {
    await srv.close();
  }
});
