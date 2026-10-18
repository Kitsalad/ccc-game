const { app } = require('@azure/functions');
const crypto = require('crypto');
const { verifyMessage, isAddress } = require('ethers');
const { db, readItem } = require('../lib/db');
const { HttpError, handler } = require('../lib/http');

const message = (address, nonce) =>
  `Sign in to the CCC Grow Game.\n\nThis only proves you own this wallet. It costs nothing and approves no transactions.\n\nWallet: ${address}\nNonce: ${nonce}`;

// Step 1: get a one-time message to sign.
app.http('authNonce', {
  route: 'auth/nonce',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(
    async ({ body }) => {
      if (!isAddress(body.address || '')) throw new HttpError(400, 'That is not a valid wallet address.');
      const address = body.address.toLowerCase();
      const nonce = crypto.randomBytes(16).toString('hex');
      const { sessions } = await db();
      await sessions.items.upsert({ id: 'nonce:' + address, address, nonce, ttl: 600 });
      return { message: message(address, nonce) };
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
        signer = verifyMessage(message(address, n.nonce), body.signature).toLowerCase();
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
