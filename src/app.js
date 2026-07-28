import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authConfigProblems, config } from './config.js';
import { authRouter } from './routes/auth.js';
import { linkCodesRouter } from './routes/linkCodes.js';
import { bansRouter, publicBansRouter } from './routes/bans.js';
import { botRouter } from './routes/bot.js';
import { unbanRequestsRouter } from './routes/unbanRequests.js';
import { staffApplicationsRouter } from './routes/staffApplications.js';
import { banRequestsRouter } from './routes/banRequests.js';
import { notificationsRouter } from './routes/notifications.js';
import { mapsRouter } from './routes/maps.js';
import { mapVotesRouter } from './routes/mapVotes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'blob:', 'https:']
      }
    }
  }));
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const allowed = new Set([config.frontendUrl, config.publicBaseUrl].filter(Boolean));
      return cb(null, allowed.has(origin));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
  // Signed cookie sessions avoid Passenger/MySQL session-store failures.
  // Keep the payload compact: OAuth state and a minimal authenticated user only.
  app.use(cookieSession({
    name: 'cb_panel_session',
    keys: [config.sessionSecret],
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookiesSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }));

  app.get('/health', (req, res) => res.json({
    ok: true,
    service: 'cb-ban-panel',
    runtime: 'plesk-passenger',
    database: 'mysql',
    time: new Date().toISOString(),
    discordOAuth: {
      clientIdConfigured: Boolean(config.discord.clientId),
      clientSecretConfigured: Boolean(config.discord.clientSecret),
      redirectUri: config.discord.redirectUri || null,
      guildIdConfigured: Boolean(config.discord.guildId),
      scopes: config.discord.oauthScopes.split(/\s+/).filter(Boolean)
    },
    session: {
      secureCookie: config.cookiesSecure,
      secretConfigured: config.sessionSecret !== 'dev-secret-change-me' && config.sessionSecret.length >= 32
    },
    databaseConfigured: Boolean(config.mysql.user && config.mysql.password && config.mysql.database),
    authConfigurationProblems: authConfigProblems()
  }));

  app.use('/auth', authRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/link-codes', linkCodesRouter);
  app.use('/api/bans', bansRouter);
  app.use('/api/unban-requests', unbanRequestsRouter);
  app.use('/api/staff-applications', staffApplicationsRouter);
  app.use('/api/ban-requests', banRequestsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/maps', mapsRouter);
  app.use('/api/map-votes', mapVotesRouter);
  app.use('/api/public/bans', publicBansRouter);
  app.use('/api/bot', botRouter);

  // The React production build is served by the same Passenger application.
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path === '/health') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err, req, res, next) => {
    console.error(err);
    if (err?.name === 'ZodError') return res.status(400).json({ error: 'validation_error', details: err.errors });
    if (err?.name === 'MulterError' || err?.code === 'LIMIT_FILE_SIZE' || err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_PART_COUNT') {
      const status = err.statusCode || 413;
      const mapUploadError = err.field === 'image';
      const code = mapUploadError
        ? (err.code === 'LIMIT_FILE_SIZE' ? 'map_image_too_large' : 'map_image_upload_failed')
        : err.code === 'LIMIT_FILE_SIZE' ? 'evidence_file_size_exceeded' : err.code === 'LIMIT_FILE_COUNT' ? 'evidence_file_count_exceeded' : 'evidence_upload_failed';
      return res.status(status).json({ error: code });
    }
    const status = err?.statusCode || 500;
    const safeMessage = status >= 500 && process.env.NODE_ENV === 'production' ? 'server_error' : (err.message || 'server_error');
    res.status(status).json({ error: safeMessage });
  });

  return app;
}
