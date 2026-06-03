# Task Queue — Usage Reference

## Adding tasks

### One-shot (run once at a specific time)

```bash
node ~/projects/task-queue/cli.cjs add "backup home" "tar czf /tmp/home.tar.gz ~/Documents" --at "2026-02-21T20:00:00"
```

The task fires at or after the given ISO timestamp. After execution: `status=done` (or `failed`).

### Recurring (cron schedule)

```bash
node ~/projects/task-queue/cli.cjs add "ping check" "ping -c 1 8.8.8.8" --every "*/5 * * * *"
```

Fires every time the cron expression matches the runner tick (every minute). After execution: back to `status=pending`.

### Immediate (no schedule — runs on next runner tick)

```bash
node ~/projects/task-queue/cli.cjs add "say hello" "echo hello world"
```

## Listing & inspecting

```bash
node ~/projects/task-queue/cli.cjs list
node ~/projects/task-queue/cli.cjs list --status pending
node ~/projects/task-queue/cli.cjs list --status failed
node ~/projects/task-queue/cli.cjs status a1b2c3d4
```

## Managing tasks

```bash
node ~/projects/task-queue/cli.cjs cancel a1b2c3d4   # stop a task
node ~/projects/task-queue/cli.cjs done   a1b2c3d4   # manually mark done
node ~/projects/task-queue/cli.cjs clear --done       # remove done+cancelled
node ~/projects/task-queue/cli.cjs clear --failed     # remove failed
node ~/projects/task-queue/cli.cjs clear --all        # empty the queue
```

## Cron expression cheat sheet

| Expression    | Meaning                  |
| ------------- | ------------------------ |
| `* * * * *`   | Every minute             |
| `*/5 * * * *` | Every 5 minutes          |
| `0 * * * *`   | Every hour (on the hour) |
| `0 9 * * *`   | Daily at 09:00           |
| `0 9 * * 1`   | Every Monday at 09:00    |
| `0 9 1 * *`   | 1st of every month at 09 |

Format: `minute hour day-of-month month day-of-week`

## Troubleshooting

| Issue                                   | Fix                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Task stays `pending`                    | Check scheduled_at or cron_expr; run runner manually to test              |
| Task shows `running` but never finishes | Previous runner crash; manually set `status=pending` in queue.json        |
| No output in log                        | Check cron is installed: `crontab -l`; check runner.log permissions       |
| Command fails                           | Check error field with `cli.cjs status <id>`; test command in shell first |

## Viewing runner log

```bash
tail -50 ~/projects/task-queue/runner.log
tail -f ~/projects/task-queue/runner.log   # live
```
