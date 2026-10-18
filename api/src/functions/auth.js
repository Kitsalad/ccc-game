const { app } = require('@azure/functions');
const crypto = require('crypto');
const { verifyMessage, isAddress, getAddress } = require('ethers');
const { db, readItem } = require('../lib/db');
const { HttpError, handler } = require('../lib/http');
const { ALLOWED_ORIGINS } = require('../lib/config');

// Standard Sign-In with Ethereum (EIP-4361) message. Wallets recognise this format
// and check the domain against the site the user is on.
const siwe = (origin, address, nonce, issuedAt) =>
  `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${getAddress(address)}\n\n` +
  `Sign in to the CCC Grow Game. This only proves you own this wallet: no gas, no transactions, no approvals.\n\n` +
  `URI: ${origin}\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

// Step 1: get a one-time message to sign.
app.http('authNonce', {
  route: 'auth/nonce',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(
    async ({ body, request }) => {
      if (!isAddress(body.address || '')) throw new HttpError(400, 'That is not a valid wallet address.');
      const origin = request.headers.get('origin') || '';
      if (!ALLOWED_ORIGINS.includes(origin)) throw new HttpError(403, 'Sign-in is only available on the game site.');
      const address = body.address.toLowerCase();
      const nonce = crypto.randomBytes(16).toString('hex');
      const message = siwe(origin, address, nonce, new Date().toISOString());
      const { sessions } = await db();
      await sessions.items.upsert({ id: 'nonce:' + address, address, message, ttl: 600 });
      return { message };
    },
    { auth: false }
  )
});

// Step 2: send back the signature, get a session token.
app.http('authVerify', {
  route: 'auth/verify',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(
    async ({ body }) => {
      if (!isAddress(body.address || '') || typeof body.signature !== 'string')
        throw new HttpError(400, 'Missing wallet or signature.');
      const address = body.address.toLowerCase();
      const { sessions } = await db();
      const n = await readItem(sessions, 'nonce:' + address, 'nonce:' + address);
      if (!n) throw new HttpError(400, 'Sign-in request expired. Please try again.');

      let signer;
      try {
        signer = verifyMessage(n.message, body.signature).toLowerCase();
      } catch {
        throw new HttpError(400, 'Could not read that signature.');
      }
      await sessions.item(n.id, n.id).delete().catch(() => {});
      if (signer !== address) throw new HttpError(401, 'Signature does not match this wallet.');

      const token = crypto.randomBytes(32).toString('hex');
      await sessions.items.create({ id: 'tok:' + token, address, ttl: 7 * 24 * 3600 });
      return { token, wallet: address };
    },
    { auth: false }
  )
});
