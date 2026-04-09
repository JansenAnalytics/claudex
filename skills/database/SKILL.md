---
name: database
description: "Manage PostgreSQL, SQLite, and Redis databases: create, migrate, backup, restore, query, optimize."
---

# database

Manage PostgreSQL, SQLite, and Redis databases: create, migrate, backup, restore, query, optimize.

## When to Use

- Setting up new databases or tables
- Running schema migrations
- Creating and restoring backups
- Debugging query performance
- Managing database users and permissions
- Health checking database instances

## Scripts

| Script            | Purpose                                       | Usage                                                             |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `backup.sh`       | Backup/restore PostgreSQL or SQLite databases | `bash scripts/backup.sh backup\|restore <type> <db> [file]`       |
| `migrate.sh`      | Run SQL migration files in order              | `bash scripts/migrate.sh <db-url> <migrations-dir>`               |
| `health-check.sh` | Check database connectivity and basic stats   | `bash scripts/health-check.sh <type> <connection>`                |
| `user-manager.sh` | Manage PostgreSQL users and permissions       | `bash scripts/user-manager.sh create\|grant\|revoke\|list <args>` |

## References

| File                       | Contents                                   |
| -------------------------- | ------------------------------------------ |
| `postgresql-cheatsheet.md` | Common PostgreSQL commands and patterns    |
| `sqlite-cheatsheet.md`     | SQLite CLI and SQL reference               |
| `redis-cheatsheet.md`      | Redis commands and data structures         |
| `backup-strategies.md`     | Backup approaches for production databases |

## Examples

### Backup a SQLite database

```bash
bash scripts/backup.sh backup sqlite /path/to/mydb.sqlite3
```

### Run migrations

```bash
bash scripts/migrate.sh sqlite:///path/to/db.sqlite3 ./migrations/
```

### Health check PostgreSQL

```bash
bash scripts/health-check.sh postgres "host=localhost dbname=myapp user=admin"
```
