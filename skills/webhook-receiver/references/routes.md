# Webhook Receiver — Route Configuration Reference

## config.json structure

```json
{
  "port": 9876,
  "routes": [
    {
      "path": "/github",
      "secret": "your-webhook-secret",
      "command": "bash $HOME/scripts/handle-github.sh",
      "description": "GitHub webhooks"
    }
  ]
}
```

Config is reloaded on every incoming request — no restart needed after editing.

---

## Route fields

| Field         | Required | Description                                   |
| ------------- | -------- | --------------------------------------------- |
| `path`        | Yes      | URL path to match (e.g. `/github`, `/stripe`) |
| `secret`      | No       | HMAC-SHA256 secret for signature validation   |
| `command`     | No       | Shell command to run on receipt               |
| `description` | No       | Human-readable label (not used at runtime)    |

---

## Signature validation

When `secret` is set, the server checks the `X-Hub-Signature-256` header (GitHub format):

```
X-Hub-Signature-256: sha256=<hmac-sha256-of-body>
```

Also accepts: `X-Signature-256`, `X-Signature`.

Requests with an invalid or missing signature receive `403 Forbidden`.
Requests to routes with no secret configured skip signature validation entirely.

---

## Command environment variables

Every command receives these environment variables:

| Variable          | Contents                              |
| ----------------- | ------------------------------------- |
| `WEBHOOK_ROUTE`   | The matched URL path (e.g. `/github`) |
| `WEBHOOK_BODY`    | Raw request body as a string          |
| `WEBHOOK_HEADERS` | All request headers as a JSON string  |
| `WEBHOOK_IP`      | Remote IP address of the sender       |

### Parsing JSON body in bash

```bash
# Using python3 (available on system)
EVENT=$(echo "$WEBHOOK_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('action',''))")
REPO=$(echo "$WEBHOOK_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('repository',{}).get('full_name',''))")
echo "Event: $EVENT on $REPO"
```

### Parsing JSON body in Node.js script

```bash
# command can call a node script
"command": "node $HOME/scripts/handle-webhook.cjs"
```

---

## Example routes

### GitHub push/PR events

```json
{
  "path": "/github",
  "secret": "my-github-secret",
  "command": "bash $HOME/scripts/github-handler.sh"
}
```

GitHub webhook setup:

- Go to repo → Settings → Webhooks → Add webhook
- Payload URL: `https://yourdomain.com/github` (or via ngrok for local)
- Secret: same as in config
- Content type: `application/json`
- Events: choose what you want

### Generic notification (no command)

```json
{
  "path": "/notify",
  "secret": "",
  "command": "curl -s -d \"$WEBHOOK_BODY\" ntfy.sh/my-alerts"
}
```

### Trigger a script on any POST

```json
{
  "path": "/deploy",
  "secret": "deploy-secret-xyz",
  "command": "bash $HOME/projects/myapp/deploy.sh >> $HOME/projects/myapp/deploy.log 2>&1"
}
```

### Log events from ntfy

```json
{
  "path": "/ntfy-events",
  "secret": "",
  "command": "echo \"$(date): $WEBHOOK_BODY\" >> $HOME/logs/ntfy-events.log"
}
```

---

## Testing a route

```bash
# Simple POST (no secret)
curl -X POST -d '{"test": true}' http://127.0.0.1:9876/ping

# With GitHub-style signature
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

## Exposing to the internet (for real webhooks)

The server binds to `127.0.0.1` only. To receive real webhooks:

### Option A: ngrok (quick, for testing)

```bash
ngrok http 9876
# Use the https://xxx.ngrok.io URL as your webhook endpoint
```

### Option B: nginx reverse proxy

```nginx
location /webhook/ {
    proxy_pass http://127.0.0.1:9876/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Option C: Tailscale / VPN

Expose port 9876 on the Tailscale interface only — no public internet exposure.
