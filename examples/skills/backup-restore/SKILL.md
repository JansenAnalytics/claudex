---
name: backup-restore
description: "Automated backup strategies: database dumps, file snapshots, incremental backups, verification, disaster recovery. Use when: setting up backup schedules, creating database backups, restoring from b..."
---

# backup-restore

Automated backup strategies: database dumps, file snapshots, incremental backups, verification, disaster recovery. Use when: setting up backup schedules, creating database backups, restoring from backups, verifying backup integrity, or planning disaster recovery.

## Workflows

### Create a backup

```bash
bash scripts/backup.sh --type <pg|sqlite|files> --source <path-or-db> --dest <backup-dir>
```

Creates timestamped, compressed backups. Supports PostgreSQL, SQLite, and file directories.

### Restore from backup

```bash
bash scripts/restore.sh --type <pg|sqlite|files> --backup <backup-file> --dest <target>
```

Restores from a backup archive. Prompts for confirmation before overwriting.

### Verify backup integrity

```bash
bash scripts/verify-backup.sh <backup-file>
```

Checks checksums, tests archive integrity, and validates contents.

### Clean up old backups (retention)

```bash
bash scripts/retention-cleanup.sh <backup-dir> [--keep-days 30] [--keep-count 10]
```

Removes old backups based on age or count, keeping minimum required.

### Set up cron schedule

```bash
bash scripts/cron-setup.sh --schedule "0 2 * * *" --command "bash /path/to/backup.sh ..."
```

Adds a cron entry for automated backups.

## Scripts

| Script                         | Purpose                            |
| ------------------------------ | ---------------------------------- |
| `scripts/backup.sh`            | Universal backup (pg/sqlite/files) |
| `scripts/restore.sh`           | Restore from backup                |
| `scripts/verify-backup.sh`     | Verify backup integrity            |
| `scripts/retention-cleanup.sh` | Clean old backups                  |
| `scripts/cron-setup.sh`        | Set up cron schedule               |

## References

| File                              | Contents                              |
| --------------------------------- | ------------------------------------- |
| `references/backup-strategies.md` | 3-2-1 rule, patterns, restore testing |
