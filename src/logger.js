import pino from 'pino';
import { LOG_LEVEL } from './config.js';
import { requestContext } from './context.js';

const baseLogger = pino({ level: LOG_LEVEL });

function withRequestId(obj) {
  const ctx = requestContext.getStore();
  if (!ctx) return obj;
  if (typeof obj === 'object' && obj !== null) return { requestId: ctx.requestId, ...obj };
  return { requestId: ctx.requestId };
}

export const logger = new Proxy(baseLogger, {
  get(target, prop) {
    if (['info', 'warn', 'error', 'debug', 'trace', 'fatal'].includes(prop)) {
      return (obj, ...args) => {
        return target[prop](withRequestId(obj), ...args);
      };
    }
    return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
  },
});

export function childLogger(requestId) {
  return baseLogger.child({ requestId });
}
