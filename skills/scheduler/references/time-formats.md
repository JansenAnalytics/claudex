# Natural Language Time Formats

All patterns supported by the scheduler's `--every` and `--at` flags.

## Intervals (`--every`)

| Expression              | Cron           | Notes         |
| ----------------------- | -------------- | ------------- |
| `every minute`          | `* * * * *`    | Every minute  |
| `every 15 minutes`      | `*/15 * * * *` | Any N minutes |
| `every 2 hours`         | `0 */2 * * *`  | Any N hours   |
| `every hour` / `hourly` | `0 * * * *`    |               |
| `every 3 days`          | `0 0 */3 * *`  | Any N days    |

## Daily (`--every`)

| Expression            | Cron         | Notes      |
| --------------------- | ------------ | ---------- |
| `every day` / `daily` | `0 0 * * *`  | Midnight   |
| `every day at 9am`    | `0 9 * * *`  |            |
| `every day at 9:30am` | `30 9 * * *` |            |
| `every day at 14:00`  | `0 14 * * *` | 24h format |
| `daily at noon`       | `0 12 * * *` |            |
| `daily at midnight`   | `0 0 * * *`  |            |
| `every morning`       | `0 9 * * *`  | 9am        |
| `every evening`       | `0 18 * * *` | 6pm        |
| `every night`         | `0 22 * * *` | 10pm       |

## Weekly (`--every`)

| Expression                   | Cron           | Notes        |
| ---------------------------- | -------------- | ------------ |
| `every Monday`               | `0 9 * * 1`    | 9am Monday   |
| `every Monday at 8:30am`     | `30 8 * * 1`   |              |
| `every Friday at 5pm`        | `0 17 * * 5`   |              |
| `every Sunday at midnight`   | `0 0 * * 0`    |              |
| `every weekday`              | `0 9 * * 1-5`  | Mon–Fri      |
| `every weekday at 9am`       | `0 9 * * 1-5`  |              |
| `every weekend`              | `0 10 * * 6,0` | Sat+Sun      |
| `every weekend at 10am`      | `0 10 * * 6,0` |              |
| `every Monday-Friday at 9am` | `0 9 * * 1-5`  | Range syntax |

## Multi-daily (`--every`)

| Expression      | Cron                | Notes     |
| --------------- | ------------------- | --------- |
| `twice a day`   | `0 9,21 * * *`      | 9am + 9pm |
| `twice daily`   | `0 9,21 * * *`      |           |
| `3 times a day` | `0 7,13,19 * * *`   |           |
| `4 times a day` | `0 6,12,18,0 * * *` |           |

## One-shots (`--at`)

| Expression            | Notes                |
| --------------------- | -------------------- |
| `2026-02-21 18:00`    | Specific date + time |
| `2026-02-21T18:00:00` | ISO format           |
| `tomorrow at 3pm`     | Relative day         |
| `today at 6pm`        | Today                |
| `in 2 hours`          | Relative offset      |
| `in 30 minutes`       |                      |
| `in 1 day`            |                      |

## Raw Cron Passthrough

If you provide a valid 5-field cron expression directly, it's used as-is:

```
*/15 * * * *
0 9 * * 1-5
30 8 * * 1
0 0 * * 0
```

## Day Name Reference

| Name            | Number |
| --------------- | ------ |
| Sunday / sun    | 0      |
| Monday / mon    | 1      |
| Tuesday / tue   | 2      |
| Wednesday / wed | 3      |
| Thursday / thu  | 4      |
| Friday / fri    | 5      |
| Saturday / sat  | 6      |
