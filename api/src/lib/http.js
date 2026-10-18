const { db, readItem } = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (status, body) => ({ status, jsonBody: body });

// Wraps a handler: JSON errors, and optional sign-in check.
function handler(fn, { auth = true } = {}) {
  return async (request, context) => {
    try {
      let wallet = null;
      if (auth) wallet = await requireWallet(request);
      const body = ['POST', 'PUT'].includes(request.method) ? await request.json().catch(() => ({})) : {};
      return json(200, await fn({ request, context, wallet, body }));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      context.error(e);
      return json(500, { error: 'Something went wrong on our side. Try again in a minute.' });
    }
  };
}

async function requireWallet(request) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(401, 'Please sign in with your wallet.');
  const { sessions } = await db();
  const s = await readItem(sessions, 'tok:' + token, 'tok:' + token);
  if (!s) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return s.address;
}

module.exports = { HttpError, handler };
