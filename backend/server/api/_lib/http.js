const ADMIN_EMAIL = (process.env.STREAMIX_ADMIN_EMAIL || '').trim().toLowerCase();

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && require('node:crypto').timingSafeEqual(left, right);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

// Sessions come from Neon Better Auth. This server only verifies them, and a
// signed-in account is never an administrator unless its e-mail is the one
// explicitly authorised in STREAMIX_ADMIN_EMAIL.
async function requireAdmin(req, res) {
  const base = (process.env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');
  if (!base || !ADMIN_EMAIL) {
    res.status(503).json({error: 'auth_not_configured'});
    return false;
  }
  const cookie = req.headers.cookie || '';
  if (!cookie) {
    res.status(401).json({error: 'unauthenticated'});
    return false;
  }
  for (const suffix of ['/get-session', '/auth/get-session']) {
    let response;
    try {
      response = await fetch(base + suffix, {
        headers: {cookie: cookie, accept: 'application/json'},
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const body = await response.json().catch(() => null);
    const user = (body && (body.user || (body.data && body.data.user) || (body.session && body.session.user))) || null;
    if (!user || !user.email) continue;
    if (!sameSecret(user.email.trim().toLowerCase(), ADMIN_EMAIL)) {
      res.status(403).json({error: 'not_administrator'});
      return false;
    }
    req.admin = {id: user.id || null, email: user.email};
    return true;
  }
  res.status(401).json({error: 'unauthenticated'});
  return false;
}

module.exports = {readBody, setSecurityHeaders, requireAdmin};
