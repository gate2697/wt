import { db } from './database.js';

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  roles_json TEXT NOT NULL DEFAULT '[]',
  perms_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS link_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by_user_id INTEGER,
  claimed_by_external_id TEXT,
  service_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS player_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  service_name TEXT NOT NULL DEFAULT 'warthunder',
  external_id TEXT NOT NULL,
  external_username TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(service_name, external_id),
  UNIQUE(user_id, service_name, external_id)
);

CREATE INDEX IF NOT EXISTS idx_player_links_service_id ON player_links(service_name, external_id);
CREATE INDEX IF NOT EXISTS idx_player_links_username ON player_links(external_username);

CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warthunder_username TEXT NOT NULL,
  warthunder_id TEXT,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by_user_id INTEGER,
  created_by_label TEXT,
  revoked_at TEXT,
  revoked_by_user_id INTEGER,
  revoke_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bans_wt_id ON bans(warthunder_id);
CREATE INDEX IF NOT EXISTS idx_bans_wt_name ON bans(warthunder_username);
CREATE INDEX IF NOT EXISTS idx_bans_status ON bans(status);

CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warthunder_id TEXT NOT NULL,
  username TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warthunder_id, username)
);

CREATE TABLE IF NOT EXISTS active_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'bot',
  warthunder_username TEXT NOT NULL,
  warthunder_id TEXT,
  seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source, warthunder_username)
);

CREATE TABLE IF NOT EXISTS cb_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  online INTEGER NOT NULL DEFAULT 0,
  name TEXT DEFAULT 'CB',
  invite_hint TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO cb_status (id, online, name, invite_hint) VALUES (1, 0, 'CB', 'Ask a moderator for an invite.');

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ban_id INTEGER NOT NULL,
  user_id INTEGER,
  discord_result_json TEXT NOT NULL DEFAULT '{}',
  email_result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(ban_id) REFERENCES bans(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_label TEXT,
  target_type TEXT,
  target_id TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(schema);

// Safe upgrades for older local databases. SQLite cannot add IF NOT EXISTS columns.
for (const stmt of [
  `ALTER TABLE users ADD COLUMN email TEXT`,
  `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`
]) {
  try { db.exec(stmt); } catch (err) { if (!String(err.message).includes('duplicate column')) throw err; }
}

console.log('Database migrated.');
