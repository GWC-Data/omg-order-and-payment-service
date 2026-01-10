import express from 'express';
import { Server, reportDebug, middleware } from 'node-server-engine';
import * as endpoints from 'endpoints';
import { Request, Response, NextFunction } from 'express';

reportDebug.setNameSpace('payment-service');

const jsonWithRawBody = express.json({
  verify: (req: express.Request, _res, buf) => {
    if (buf?.length) {
      (req as express.Request & { rawBody?: string }).rawBody =
        buf.toString('utf8');
    }
  }
});


function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const log = {
      severity:
        res.statusCode >= 500
          ? 'ERROR'
          : res.statusCode >= 400
          ? 'WARNING'
          : 'INFO',
      message: 'HTTP Request',
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl || req.url,
        status: res.statusCode,
        latency: `${durationMs.toFixed(2)}ms`,
        remoteIp:
          req.headers['x-forwarded-for']?.toString().split(',')[0] ||
          req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };

    console.log(JSON.stringify(log));
  });

  next();
}

/** Initialize the server */
export function createServer(): Server {
  return new Server({
    globalMiddleware: [jsonWithRawBody, middleware.swaggerDocs(),requestLogger],
    endpoints: Object.values(endpoints)
  });
}
