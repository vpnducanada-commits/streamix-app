// Same-origin proxy for Neon Better Auth so the admin dashboard keeps a
// first-party session cookie. This server never issues or stores credentials.
const BASE = (process.env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!BASE) {
    res.status(503).json({error: 'auth_not_configured'});
    return;
  }
  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path || ''];
  const target = BASE + '/' + parts.filter(Boolean).join('/');
  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
    accept: 'application/json',
  };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.origin) headers.origin = req.headers.origin;

  const init = {method: req.method, headers: headers, signal: AbortSignal.timeout(10000)};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  try {
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    const cookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    console.error('auth_proxy_failed', error.message);
    res.status(503).json({error: 'auth_unreachable'});
  }
};
