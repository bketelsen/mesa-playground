import { requestContext } from './context.js';

function sendError(res, code, message) {
  const ctx = requestContext.getStore();
  const body = { error: { code, message } };
  if (ctx?.requestId) body.requestId = ctx.requestId;
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export { sendError };
