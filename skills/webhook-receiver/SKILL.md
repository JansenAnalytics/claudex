---
name: webhook-receiver
description: "Lightweight background HTTP server that receives webhooks from external services (GitHub, ntfy, Stripe, any HTTP POST) and runs configured shell commands in response. Use when setting up webhook integrations, receiving GitHub push/PR/issue events, triggering scripts from external services, or exposing a local endpoint for testing. Switches from polling to event-driven: things happen the moment they're triggered, not on the next cron cycle."
---

# Webhook Receiver

A persistent Node.js HTTP server that listens for incoming POST requests, validates
optional HMAC-SHA256 signatures, and executes shell commands per route.

**Project location:** `~/projects/webhook-receiver/`
**Config:** `~/projects/webhook-receiver/config.json` (live-reloaded, no restart needed)
**Log:** `~/projects/webhook-receiver/logs/webhook.log`
**Port:** 9876 (localhost only — expose via nginx/ngrok/Tailscale for real webhooks)

---

## Start / Stop / Status

```bash
# Start
bash /home/ajans/openclaw/skills/webhook-receiver/scripts/start.sh

# Stop
bash /home/ajans/openclaw/skills/webhook-receiver/scripts/stop.sh

# Status + recent log
bash /home/ajans/openclaw/skills/webhook-receiver/scripts/status.sh
```

---

## Adding a Route

Edit `~/projects/webhook-receiver/config.json` directly — changes take effect immediately, no restart:

```json
{
  "routes": [
    {
      "path": "/github",
      "secret": "your-github-webhook-secret",
      "command": "bash /home/ajans/scripts/handle-github.sh",
      "description": "GitHub events"
    },
    {
      "path": "/ping",
      "secret": "",
      "command": "",
      "description": "Health check"
    }
  ]
}
```

---

## Testing

```bash
# Test the ping route (always returns 200)
curl -X POST -d '{"hello":"world"}' http://127.0.0.1:9876/ping

# Test with GitHub-style signature
SECRET="mysecret"
BODY='{"action":"push"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"
curl -X POST \
  -H "X-Hub-Signature-256: $SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  http://127.0.0.1:9876/github
```

---

## Command Environment Variables

Commands receive:

| Variable          | Contents                  |
| ----------------- | ------------------------- |
| `WEBHOOK_ROUTE`   | URL path (e.g. `/github`) |
| `WEBHOOK_BODY`    | Raw request body          |
| `WEBHOOK_HEADERS` | All headers as JSON       |
| `WEBHOOK_IP`      | Sender IP                 |

---

## Trigger Phrases

- "Start the webhook receiver"
- "Stop the webhook server"
- "Add a webhook route for GitHub"
- "Set up a webhook for [service]"
- "Check webhook receiver status"
- "Show recent webhook logs"
- "Add a secret to the /github route"

---

## Reference

See [references/routes.md](references/routes.md) for:

- Full config format
- Signature validation details
- Example routes for GitHub, ntfy, deploy triggers
- Exposing to the internet (nginx, ngrok, Tailscale)
- Parsing JSON body in commands
