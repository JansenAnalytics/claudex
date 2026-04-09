---
name: docker
description: "Manage Docker containers and Compose stacks: build, run, stop, logs, exec, prune, multi-service orchestration."
---

# Docker Skill

Manage Docker containers and Compose stacks: build, run, stop, logs, exec, prune, multi-service orchestration.

## Use When

- Building/running containers or debugging container issues
- Setting up docker-compose stacks
- Managing images, volumes, networks
- Containerizing applications
- Multi-service orchestration

## Quick Reference

### Container Lifecycle

```bash
# Run container (detached, with name, port mapping, env vars)
docker run -d --name myapp -p 8080:80 -e NODE_ENV=production --restart unless-stopped myimage:latest

# Interactive shell
docker exec -it myapp bash

# Logs (follow, with timestamps, last 100 lines)
docker logs -f --tail 100 --timestamps myapp

# Stop / remove
docker stop myapp && docker rm myapp

# List running (all with -a)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Building Images

```bash
# Build with tag
docker build -t myapp:latest .

# Multi-stage build (target specific stage)
docker build --target production -t myapp:prod .

# Build with build args
docker build --build-arg VERSION=1.2.3 -t myapp:1.2.3 .

# No cache rebuild
docker build --no-cache -t myapp:latest .
```

### Docker Compose

```bash
# Start all services (detached)
docker compose up -d

# Start specific service
docker compose up -d postgres

# Rebuild and restart
docker compose up -d --build

# View logs across services
docker compose logs -f --tail 50

# Stop and remove everything (including volumes)
docker compose down -v

# Scale a service
docker compose up -d --scale worker=3

# Execute command in running service
docker compose exec web bash

# View service status
docker compose ps
```

### Debugging

```bash
# Inspect container (full JSON)
docker inspect myapp

# Resource usage
docker stats --no-stream

# See container processes
docker top myapp

# Copy files out of container
docker cp myapp:/app/logs/error.log ./error.log

# Check why container exited
docker inspect --format='{{.State.ExitCode}} {{.State.Error}}' myapp

# Network debugging
docker network ls
docker network inspect bridge

# Enter stopped container's filesystem
docker run --rm -it --entrypoint sh myimage:latest
```

### Cleanup

```bash
# Remove all stopped containers, unused networks, dangling images, build cache
docker system prune -f

# Also remove unused volumes (DESTRUCTIVE)
docker system prune -af --volumes

# Show disk usage
docker system df

# Remove dangling images only
docker image prune -f

# Remove images older than 24h
docker image prune -a --filter "until=24h"
```

### Volumes & Networks

```bash
# Create named volume
docker volume create mydata

# Run with volume mount
docker run -d -v mydata:/app/data myapp

# Bind mount (host directory)
docker run -d -v $(pwd)/config:/app/config:ro myapp

# Create custom network
docker network create mynet
docker run -d --network mynet --name api myapi
docker run -d --network mynet --name web myweb  # can reach api by hostname
```

## Helper Scripts

### Generate docker-compose template

```bash
bash scripts/compose-gen.sh <project-name> [services...]
# Example: bash scripts/compose-gen.sh myproject web postgres redis
```

### Check container health

```bash
bash scripts/health-check.sh [container-name|all]
```

### Cleanup/prune with safety

```bash
bash scripts/cleanup.sh [--aggressive]
```

## Common Patterns

### Dockerfile — Node.js app

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Dockerfile — Python app

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER nobody
EXPOSE 8000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
```

## Troubleshooting

| Problem                          | Solution                                               |
| -------------------------------- | ------------------------------------------------------ |
| Container exits immediately      | Check `docker logs myapp`, verify CMD/ENTRYPOINT       |
| Port already in use              | `lsof -i :8080` or change host port                    |
| Permission denied on volume      | Check UID mapping, use `--user $(id -u):$(id -g)`      |
| Can't connect between containers | Use same network, reference by container name          |
| Out of disk space                | `docker system prune -af --volumes`                    |
| Build cache too large            | `docker builder prune -af`                             |
| DNS issues in container          | `docker run --dns 8.8.8.8` or check `/etc/resolv.conf` |
