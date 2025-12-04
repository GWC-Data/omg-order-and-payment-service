import express from 'express';
import { Server, reportDebug, middleware } from 'node-server-engine';
import * as endpoints from 'endpoints';

reportDebug.setNameSpace('payment-service');

const jsonWithRawBody = express.json({
  verify: (req: express.Request, _res, buf) => {
    if (buf?.length) {
      (req as express.Request & { rawBody?: string }).rawBody =
        buf.toString('utf8');
    }
  }
});

/** Initialize the server */
export function createServer(): Server {
  return new Server({
    globalMiddleware: [jsonWithRawBody, middleware.swaggerDocs()],
    endpoints: Object.values(endpoints)
  });
}
