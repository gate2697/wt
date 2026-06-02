import { migrate } from './db/migrate.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { linkCodesRouter } from './routes/linkCodes.js';
import { bansRouter, publicBansRouter } from './routes/bans.js';
import { botRouter } from './routes/bot.js';

await migrate();

const MySQLStore = MySQLStoreFactory(session);
const app = express();

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
app.use(rateLimit({ windowMs: 60_000, limit: 180 }));
app.use(session({
  store: sessionStore,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookiesSecure }
}));

app.get('/health', (req, res) => res.json({ ok: true, database: 'mysql' }));
app.use('/auth', authRouter);
app.use('/api/link-codes', linkCodesRouter);
app.use('/api/bans', bansRouter);
app.use('/api/public/bans', publicBansRouter);
app.use('/api/bot', botRouter);

app.use((err, req, res, next) => {
  console.error(err);
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'validation_error', details: err.errors });
  res.status(500).json({ error: err.message || 'server_error' });
});

app.listen(config.port, () => console.log(`Backend running on http://localhost:${config.port}`));
