import { pool, run } from './database.js';

const statements = [
`CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(64) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  avatar TEXT NULL,
  email VARCHAR(320) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  roles_json LONGTEXT NOT NULL,
  perms_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS link_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  created_by_user_id INT NULL,
  claimed_by_external_id VARCHAR(128) NULL,
  service_name VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  claimed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_link_codes_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS player_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service_name VARCHAR(64) NOT NULL DEFAULT 'warthunder',
  external_id VARCHAR(128) NOT NULL,
  external_username VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_player_links_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_player_links_service_external (service_name, external_id),
  UNIQUE KEY uq_player_links_user_service_external (user_id, service_name, external_id),
  KEY idx_player_links_username (external_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS bans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warthunder_username VARCHAR(255) NOT NULL,
  warthunder_id VARCHAR(128) NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_by_label VARCHAR(255) NULL,
  revoked_at DATETIME NULL,
  revoked_by_user_id INT NULL,
  revoke_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bans_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_bans_wt_id (warthunder_id),
  KEY idx_bans_wt_name (warthunder_username),
  KEY idx_bans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS player_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warthunder_id VARCHAR(128) NOT NULL,
  username VARCHAR(255) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_player_aliases_id_name (warthunder_id, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS active_players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'bot',
  warthunder_username VARCHAR(255) NOT NULL,
  warthunder_id VARCHAR(128) NULL,
  seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  raw_json LONGTEXT NOT NULL,
  UNIQUE KEY uq_active_source_name (source, warthunder_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS cb_status (
  id TINYINT PRIMARY KEY,
  online TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(255) DEFAULT 'CB',
  invite_hint TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS notification_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ban_id INT NOT NULL,
  user_id INT NULL,
  discord_result_json LONGTEXT NOT NULL,
  email_result_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_ban FOREIGN KEY (ban_id) REFERENCES bans(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(128) NOT NULL,
  actor_user_id INT NULL,
  actor_label VARCHAR(255) NULL,
  target_type VARCHAR(64) NULL,
  target_id VARCHAR(128) NULL,
  data_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

export async function migrate() {
  for (const stmt of statements) await run(stmt);
  await run(
    `INSERT INTO cb_status (id, online, name, invite_hint)
     VALUES (1, 0, 'CB', 'Ask a moderator for an invite.')
     ON DUPLICATE KEY UPDATE id=id`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await migrate();
    console.log('MySQL/MariaDB database migrated.');
    await pool.end();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
