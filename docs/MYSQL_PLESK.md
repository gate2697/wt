# MySQL / MariaDB setup for Plesk / Cybrancee

This version does **not** use `better-sqlite3` anymore. The backend uses `mysql2` and stores sessions in MySQL with `express-mysql-session`.

## 1. Create a database in Plesk

In Plesk:

1. Go to **Databases**.
2. Click **Add Database**.
3. Create a database and database user.
4. Copy the database name, username, and password.

Usually the host is:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
```

Some hosts provide a different MySQL host. Use the one Plesk shows if it is not `localhost`.

## 2. Fill out the root `.env`

In the project root, copy:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
copy .env.example .env
```

Then set:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_database_user
MYSQL_PASSWORD=your_database_password
MYSQL_DATABASE=your_database_name
SESSION_SECRET=make-this-long-and-random
```

## 3. Install backend packages

From the project root:

```bash
npm --prefix backend install
```

This should no longer compile `better-sqlite3`.

## 4. Run migrations

```bash
npm --prefix backend run migrate
```

That creates the tables:

- users
- link_codes
- player_links
- bans
- player_aliases
- active_players
- cb_status
- notification_log
- audit_log
- sessions

## 5. Start the backend

```bash
npm --prefix backend start
```

Test:

```txt
https://your-domain.com/health
```

Expected response:

```json
{"ok":true,"database":"mysql"}
```
