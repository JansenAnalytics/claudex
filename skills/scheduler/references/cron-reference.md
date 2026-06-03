# Cron Syntax Reference

```
┌───────────── minute (0–59)
│ ┌─────────── hour (0–23)
│ │ ┌───────── day of month (1–31)
│ │ │ ┌─────── month (1–12)
│ │ │ │ ┌───── day of week (0–7, 0=Sunday, 7=Sunday)
│ │ │ │ │
* * * * *  command to run
```

## Special Characters

| Character | Meaning   | Example                       |
| --------- | --------- | ----------------------------- |
| `*`       | Any value | `* * * * *` = every minute    |
| `*/n`     | Every N   | `*/15 * * * *` = every 15 min |
| `n,m`     | List      | `0 9,21 * * *` = 9am and 9pm  |
| `n-m`     | Range     | `0 9 * * 1-5` = 9am Mon–Fri   |

## Common Patterns

| Pattern        | Meaning                 |
| -------------- | ----------------------- |
| `* * * * *`    | Every minute            |
| `*/15 * * * *` | Every 15 minutes        |
| `0 * * * *`    | Every hour              |
| `0 0 * * *`    | Every day at midnight   |
| `0 9 * * *`    | Every day at 9am        |
| `0 9 * * 1-5`  | Weekdays at 9am         |
| `0 9 * * 1`    | Every Monday at 9am     |
| `30 8 * * 1`   | Every Monday at 8:30am  |
| `0 9,21 * * *` | 9am and 9pm daily       |
| `0 0 1 * *`    | First of every month    |
| `0 0 1 1 *`    | January 1st at midnight |

## Crontab Editing

```bash
crontab -e    # Edit your crontab
crontab -l    # List current crontab
crontab -r    # Remove entire crontab (⚠️ destructive!)
```

## Scheduler Tags

The scheduler marks its entries with a comment tag:

```
# [scheduler] id=task-id name="Task Name"
0 9 * * * /path/to/command
```

These tags let `scheduler.cjs` track and manage its own entries without touching unrelated cron jobs.
