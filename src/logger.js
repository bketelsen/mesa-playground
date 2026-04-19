import pino from 'pino';
import { LOG_LEVEL } from './config.js';

export const logger = pino({ level: LOG_LEVEL });

export function childLogger(requestId) {
  return logger.child({ requestId });
}
