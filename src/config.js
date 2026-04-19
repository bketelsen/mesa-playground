export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
export const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 100;
export const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 15 * 60 * 1000;
export const RETRY_THRESHOLD = process.env.RETRY_THRESHOLD ? Number(process.env.RETRY_THRESHOLD) : 3;
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
