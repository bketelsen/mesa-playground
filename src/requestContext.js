import { randomUUID } from 'node:crypto';
import { requestContext } from './context.js';
import { childLogger } from './logger.js';

export { requestContext };

export function correlationId(handler) {
  return (req, res) => {
    const id = req.headers['x-request-id'] ?? randomUUID();
    req.requestId = id;
    req.log = childLogger(id);

    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = (code, headers, ...rest) => {
      const merged = typeof headers === 'object' && headers !== null
        ? { 'x-request-id': id, ...headers }
        : { 'x-request-id': id };
      return origWriteHead(code, merged, ...rest);
    };

    requestContext.run({ requestId: id }, () => handler(req, res));
  };
}
