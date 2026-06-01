// Vercel API proxy for the CB Ban Panel.
// This lets the Vercel-hosted frontend call /api/... and /auth/... while your
// real backend stays on an always-on host that can keep SQLite/session state.

const BACKEND_URL = process.env.BACKEND_URL;

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function backendPathFromVercelPath(pathParts = []) {
  const joined = pathParts.join('/');
  // Frontend login uses /auth/discord. vercel.json rewrites that to /api/auth/discord.
  if (joined === 'auth' || joined.startsWith('auth/')) return `/${joined}`;
  // Normal backend APIs are already mounted under /api on the Express server.
  return `/api/${joined}`;
}

export default async function handler(req, res) {
  if (!BACKEND_URL) {
    res.status(500).json({ error: 'missing_BACKEND_URL', message: 'Set BACKEND_URL in Vercel project environment variables.' });
    return;
  }

  const pathParts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  const target = new URL(backendPathFromVercelPath(pathParts), BACKEND_URL.replace(/\/$/, ''));

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach((v) => target.searchParams.append(key, v));
    else if (value !== undefined) target.searchParams.set(key, value);
  }

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers.connection;

  const init = { method: req.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) init.body = await collectBody(req);

  const upstream = await fetch(target, init);
  res.status(upstream.status);

  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });

  // Node fetch may combine cookies; this still works for this starter because the
  // backend currently sets one session cookie. If you add more cookies later,
  // consider using undici getSetCookies.
  const location = upstream.headers.get('location');
  if (location) res.setHeader('location', location);

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.send(buffer);
}
