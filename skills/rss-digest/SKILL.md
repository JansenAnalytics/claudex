---
name: rss-digest
description: "Subscribe to RSS/Atom feeds with keyword filters and run digests delivered to Telegram. Use when subscribing to feeds, checking which feeds run, running a digest manually, or adjusting feed keywords."
category: research
maturity: stable
tags: [rss, feeds, keywords, digest, cron]
---

# RSS Digest Skill

Use when: subscribing to feeds, checking what feeds are running, running a digest manually, or adjusting keywords.

## Add a feed

```
node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/add-feed.cjs \
  --name "Feed Name" \
  --url "https://..." \
  --keywords "keyword1,keyword2,keyword3"
```

## List feeds

```
node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/list-feeds.cjs
```

## Run digest now (dry run — no send)

```
node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/run-now.cjs --dry-run
```

## Run digest now (send to Telegram)

```
node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/run-now.cjs
```

## Test single feed parsing

```
node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/fetch-feed.cjs https://news.ycombinator.com/rss
```

## Cron

Daily at 08:00 Oslo time (06:00 UTC):

```
0 6 * * * /usr/bin/node ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/digest.cjs >> ${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/digest.log 2>&1
```

## Config

`${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/feeds.json`

## State

`${RSS_DIGEST_HOME:-$HOME/projects/rss-digest}/state.json` (seen GUIDs per feed)

## Watchdog

Monitored by watchdog (max 25h silence). If digest stops running, watchdog will alert.
