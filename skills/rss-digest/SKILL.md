---
name: rss-digest
description: RSS Digest Skill
---

# RSS Digest Skill

Use when: subscribing to feeds, checking what feeds are running, running a digest manually, or adjusting keywords.

## Add a feed

```
node /home/ajans/projects/rss-digest/add-feed.cjs \
  --name "Feed Name" \
  --url "https://..." \
  --keywords "keyword1,keyword2,keyword3"
```

## List feeds

```
node /home/ajans/projects/rss-digest/list-feeds.cjs
```

## Run digest now (dry run — no send)

```
node /home/ajans/projects/rss-digest/run-now.cjs --dry-run
```

## Run digest now (send to Telegram)

```
node /home/ajans/projects/rss-digest/run-now.cjs
```

## Test single feed parsing

```
node /home/ajans/projects/rss-digest/fetch-feed.cjs https://news.ycombinator.com/rss
```

## Cron

Daily at 08:00 Oslo time (06:00 UTC):

```
0 6 * * * /usr/bin/node /home/ajans/projects/rss-digest/digest.cjs >> /home/ajans/projects/rss-digest/digest.log 2>&1
```

## Config

`~/projects/rss-digest/feeds.json`

## State

`~/projects/rss-digest/state.json` (seen GUIDs per feed)

## Watchdog

Monitored by watchdog (max 25h silence). If digest stops running, watchdog will alert.
