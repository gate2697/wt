import { pool, query, run } from './database.js';

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
  discord_joined_at DATETIME NULL,
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
  created_by_level TINYINT NOT NULL DEFAULT 0,
  created_by_level_name VARCHAR(64) NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'not_required',
  reviewed_by_user_id INT NULL,
  reviewed_by_label VARCHAR(255) NULL,
  reviewed_at DATETIME NULL,
  review_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bans_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_bans_wt_id (warthunder_id),
  KEY idx_bans_wt_name (warthunder_username),
  KEY idx_bans_status (status),
  KEY idx_bans_review (review_status, created_by_level)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS unban_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ban_id INT NOT NULL,
  requester_user_id INT NOT NULL,
  requester_label VARCHAR(255) NOT NULL,
  warthunder_username VARCHAR(255) NOT NULL,
  warthunder_id VARCHAR(128) NULL,
  appeal_reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  reviewed_by_label VARCHAR(255) NULL,
  reviewed_at DATETIME NULL,
  review_reason TEXT NULL,
  discord_delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_attempted',
  discord_delivery_reason VARCHAR(255) NULL,
  discord_delivery_at DATETIME NULL,
  discord_message_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_unban_request_ban FOREIGN KEY (ban_id) REFERENCES bans(id) ON DELETE CASCADE,
  CONSTRAINT fk_unban_request_user FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_unban_request_status (status, created_at),
  KEY idx_unban_request_ban (ban_id),
  KEY idx_unban_request_user (requester_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS user_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  link VARCHAR(255) NULL,
  metadata_json LONGTEXT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_user_notifications_user (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS staff_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicant_user_id INT NOT NULL,
  applicant_label VARCHAR(255) NOT NULL,
  age_at_submission TINYINT UNSIGNED NOT NULL,
  discord_joined_at DATETIME NOT NULL,
  guild_days_at_submission INT UNSIGNED NOT NULL,
  experience TEXT NOT NULL,
  availability TEXT NOT NULL,
  motivation TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  reviewed_by_label VARCHAR(255) NULL,
  reviewed_at DATETIME NULL,
  review_reason TEXT NULL,
  discord_delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_attempted',
  discord_delivery_reason VARCHAR(255) NULL,
  discord_delivery_at DATETIME NULL,
  discord_message_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_application_user FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_application_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_staff_application_status (status, created_at),
  KEY idx_staff_application_user (applicant_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS ban_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_user_id INT NOT NULL,
  requester_label VARCHAR(255) NOT NULL,
  warthunder_username VARCHAR(255) NOT NULL,
  warthunder_id VARCHAR(128) NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  reviewed_by_label VARCHAR(255) NULL,
  reviewed_at DATETIME NULL,
  review_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ban_request_user FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ban_request_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_ban_request_status (status, created_at),
  KEY idx_ban_request_user (requester_user_id, created_at),
  KEY idx_ban_request_target (warthunder_username, warthunder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS evidence_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ban_id INT NULL,
  ban_request_id INT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evidence_ban FOREIGN KEY (ban_id) REFERENCES bans(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_ban_request FOREIGN KEY (ban_request_id) REFERENCES ban_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_evidence_ban (ban_id, created_at),
  KEY idx_evidence_ban_request (ban_request_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS maps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  image_url TEXT NULL,
  image_storage_name VARCHAR(255) NULL,
  image_mime_type VARCHAR(128) NULL,
  server_link TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_by_label VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maps_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_maps_active (active, created_at),
  KEY idx_maps_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS map_vote_rounds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  current_map_id INT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  started_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  ended_at DATETIME NULL,
  selected_map_id INT NULL,
  selection_reason VARCHAR(64) NULL,
  started_by_label VARCHAR(255) NULL,
  ended_by_label VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_map_round_current FOREIGN KEY (current_map_id) REFERENCES maps(id) ON DELETE SET NULL,
  CONSTRAINT fk_map_round_selected FOREIGN KEY (selected_map_id) REFERENCES maps(id) ON DELETE SET NULL,
  KEY idx_map_round_status (status, started_at),
  KEY idx_map_round_current (current_map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS map_vote_state (
  id TINYINT PRIMARY KEY,
  current_round_id INT NULL,
  current_map_id INT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'idle',
  started_at DATETIME NULL,
  ends_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_map_state_round FOREIGN KEY (current_round_id) REFERENCES map_vote_rounds(id) ON DELETE SET NULL,
  CONSTRAINT fk_map_state_current FOREIGN KEY (current_map_id) REFERENCES maps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS map_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  round_id INT NOT NULL,
  map_id INT NOT NULL,
  voter_key_hash CHAR(64) NOT NULL,
  voter_user_id INT NULL,
  voter_discord_id VARCHAR(64) NULL,
  voter_label VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_map_vote_round FOREIGN KEY (round_id) REFERENCES map_vote_rounds(id) ON DELETE CASCADE,
  CONSTRAINT fk_map_vote_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
  CONSTRAINT fk_map_vote_user FOREIGN KEY (voter_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_map_vote_voter (round_id, voter_key_hash),
  KEY idx_map_votes_count (round_id, map_id),
  KEY idx_map_votes_user (round_id, voter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS unban_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unban_request_id INT NOT NULL,
  author_user_id INT NULL,
  author_label VARCHAR(255) NOT NULL,
  author_kind VARCHAR(32) NOT NULL,
  body TEXT NOT NULL,
  discord_delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_attempted',
  discord_delivery_reason VARCHAR(255) NULL,
  discord_delivery_at DATETIME NULL,
  discord_message_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_unban_message_request FOREIGN KEY (unban_request_id) REFERENCES unban_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_unban_message_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_unban_messages_request (unban_request_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

// CREATE TABLE only affects new installations. These idempotent additions keep
// an existing Plesk database safe to upgrade without asking the owner to drop
// the bans table (which would destroy moderation history).
const banUpgradeColumns = [
  ['created_by_level', 'TINYINT NOT NULL DEFAULT 0'],
  ['created_by_level_name', 'VARCHAR(64) NULL'],
  ['review_status', "VARCHAR(32) NOT NULL DEFAULT 'not_required'"],
  ['reviewed_by_user_id', 'INT NULL'],
  ['reviewed_by_label', 'VARCHAR(255) NULL'],
  ['reviewed_at', 'DATETIME NULL'],
  ['review_reason', 'TEXT NULL']
];

const userUpgradeColumns = [
  ['discord_joined_at', 'DATETIME NULL']
];

const unbanRequestUpgradeColumns = [
  ['discord_delivery_status', "VARCHAR(32) NOT NULL DEFAULT 'not_attempted'"],
  ['discord_delivery_reason', 'VARCHAR(255) NULL'],
  ['discord_delivery_at', 'DATETIME NULL'],
  ['discord_message_id', 'VARCHAR(64) NULL']
];

const staffApplicationUpgradeColumns = [...unbanRequestUpgradeColumns];
const unbanMessageUpgradeColumns = [...unbanRequestUpgradeColumns];

async function hasColumn(tableName, columnName) {
  const rows = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function hasIndex(tableName, indexName) {
  const rows = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

export async function migrate() {
  for (const stmt of statements) await run(stmt);
  for (const [column, definition] of banUpgradeColumns) {
    if (!(await hasColumn('bans', column))) {
      await run(`ALTER TABLE bans ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  for (const [column, definition] of userUpgradeColumns) {
    if (!(await hasColumn('users', column))) {
      await run(`ALTER TABLE users ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  for (const [column, definition] of unbanRequestUpgradeColumns) {
    if (!(await hasColumn('unban_requests', column))) {
      await run(`ALTER TABLE unban_requests ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  for (const [column, definition] of staffApplicationUpgradeColumns) {
    if (!(await hasColumn('staff_applications', column))) {
      await run(`ALTER TABLE staff_applications ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  for (const [column, definition] of unbanMessageUpgradeColumns) {
    if (!(await hasColumn('unban_messages', column))) {
      await run(`ALTER TABLE unban_messages ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  await run(
    `INSERT INTO map_vote_state (id, status)
     VALUES (1, 'idle')
     ON DUPLICATE KEY UPDATE id=id`
  );
  if (!(await hasIndex('bans', 'idx_bans_review'))) {
    await run('ALTER TABLE bans ADD KEY idx_bans_review (review_status, created_by_level)');
  }
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
