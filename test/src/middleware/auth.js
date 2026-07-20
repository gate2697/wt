import { config } from '../config.js';

export function requireLogin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'login_required' });
  next();
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'login_required' });
    if (!req.session.user.perms?.[perm]) return res.status(403).json({ error: `missing_${perm}_perms` });
    next();
  };
}

export function requireBot(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== config.botApiToken) return res.status(401).json({ error: 'bot_token_required' });
  next();
}
