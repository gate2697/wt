import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { linkCodesRouter } from './routes/linkCodes.js';
import { bansRouter, publicBansRouter } from './routes/bans.js';
import { botRouter } from './routes/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const MySQLStore = MySQLStoreFactory(session);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const sessionStore = new MySQLStore({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    createDatabaseTable: true,
    schema: { tableName: 'sessions' }
  });

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
  app.use(session({
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookiesSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  app.get('/health', (req, res) => res.json({
    ok: true,
    service: 'cb-ban-panel',
    runtime: 'plesk-passenger',
    database: 'mysql',
    time: new Date().toISOString()
  }));

  app.use('/auth', authRouter);
  app.use('/api/link-codes', linkCodesRouter);
  app.use('/api/bans', bansRouter);
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
    res.status(err?.statusCode || 500).json({ error: err.message || 'server_error' });
  });

  return app;
}
