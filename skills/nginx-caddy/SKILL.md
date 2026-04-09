---
name: nginx-caddy
description: Nginx & Caddy Skill
---

# Nginx & Caddy Skill

Configure Nginx or Caddy as reverse proxy with SSL.

## Use When

- Setting up reverse proxies for web services
- Configuring SSL/TLS certificates (Let's Encrypt)
- Routing domains to backend services
- Load balancing or serving static files

## Nginx Quick Reference

### Common Commands

```bash
# Test config syntax
sudo nginx -t

# Reload (graceful)
sudo systemctl reload nginx

# View error log
sudo tail -f /var/log/nginx/error.log

# View access log
sudo tail -f /var/log/nginx/access.log
```

### Reverse Proxy (with SSL via Certbot)

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### WebSocket Proxy

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Static Files

```nginx
server {
    listen 80;
    server_name static.example.com;
    root /var/www/static;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### SSL with Certbot

```bash
# Install
sudo apt install certbot python3-certbot-nginx

# Get cert + auto-configure nginx
sudo certbot --nginx -d example.com -d www.example.com

# Renew all certs
sudo certbot renew --dry-run

# Auto-renewal is installed via systemd timer
systemctl list-timers | grep certbot
```

## Caddy Quick Reference

Caddy auto-provisions SSL certificates. Much simpler config.

### Caddyfile — Reverse Proxy

```
example.com {
    reverse_proxy localhost:8080
}
```

That's it. SSL is automatic.

### Caddyfile — Multiple Sites

```
example.com {
    reverse_proxy localhost:8080
}

api.example.com {
    reverse_proxy localhost:3000
}

static.example.com {
    root * /var/www/static
    file_server
}
```

### Caddyfile — With Options

```
example.com {
    reverse_proxy localhost:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        health_uri /health
        health_interval 30s
    }

    log {
        output file /var/log/caddy/access.log
    }

    encode gzip
}
```

### Caddy Commands

```bash
# Validate config
caddy validate --config /etc/caddy/Caddyfile

# Reload
sudo systemctl reload caddy

# Format Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile

# Run in foreground (dev)
caddy run --config Caddyfile
```

### Caddy — Load Balancing

```
example.com {
    reverse_proxy localhost:8081 localhost:8082 localhost:8083 {
        lb_policy round_robin
        health_uri /health
    }
}
```

## Helper Scripts

### Generate Nginx site config

```bash
bash scripts/nginx-gen.sh <domain> <backend-port> [--ssl] [--websocket]
```

### Generate Caddy config

```bash
bash scripts/caddy-gen.sh <domain> <backend-port> [--static <path>]
```

### Check SSL certificate

```bash
bash scripts/ssl-check.sh <domain>
```

## Installation

```bash
# Nginx
sudo apt install nginx

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Certbot (for Nginx SSL)
sudo apt install certbot python3-certbot-nginx
```

## Nginx vs Caddy Decision

| Factor            | Nginx                        | Caddy                     |
| ----------------- | ---------------------------- | ------------------------- |
| SSL setup         | Manual (certbot)             | Automatic                 |
| Config complexity | More verbose                 | Very simple               |
| Performance       | Slightly faster              | Excellent                 |
| Ecosystem         | Huge, battle-tested          | Growing                   |
| Best for          | Complex setups, high traffic | Quick deploys, simplicity |
