/**
 * Password auth: bcrypt hash + httpOnly session cookie.
 * Sessions stored in memory (lost on restart — login again, no big deal for an admin panel).
 */
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SESSIONS = new Map();
const TTL_MS = 12 * 60 * 60 * 1000;

function makeToken() { return crypto.randomBytes(32).toString('hex'); }

function createSession(userId) {
  const token = makeToken();
  SESSIONS.set(token, { userId, exp: Date.now() + TTL_MS });
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const s = SESSIONS.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { SESSIONS.delete(token); return null; }
  s.exp = Date.now() + TTL_MS;
  return s.userId;
}

function destroySession(token) { SESSIONS.delete(token); }

async function hash(pwd)         { return bcrypt.hash(pwd, 10); }
async function verify(pwd, h)    { return bcrypt.compare(pwd, h); }

function cookieOpts(req) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure:   isSecure,
    sameSite: 'lax',
    maxAge:   TTL_MS,
    path:     '/',
  };
}

function requireAuth(getUser) {
  return (req, res, next) => {
    const token = req.cookies?.dc_session;
    const userId = validateSession(token);
    if (!userId) {
      if (req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_KEY) {
        req.user = { id: 'api-key', role: 'admin' };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = getUser(userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  };
}

// Gate to owner/admin only (for managing accounts + other sensitive actions).
function requireOwner(getUser) {
  const auth = requireAuth(getUser);
  return (req, res, next) => auth(req, res, () => {
    const role = req.user && req.user.role;
    if (role === 'owner' || role === 'admin') return next();
    return res.status(403).json({ error: 'Owner access required' });
  });
}

module.exports = { hash, verify, createSession, validateSession, destroySession, cookieOpts, requireAuth, requireOwner };
