---
name: ssh-remote
description: "SSH into remote servers, execute commands, transfer files via SCP/rsync, manage SSH keys and configs, tunnel ports."
---

# ssh-remote

SSH into remote servers, execute commands, transfer files via SCP/rsync, manage SSH keys and configs, tunnel ports.

## When to Use

- Deploying to remote servers
- Managing VPS instances
- Transferring files (SCP/rsync)
- Setting up SSH tunnels or port forwarding
- Configuring SSH keys and agent forwarding
- Running remote commands or scripts

## Quick Reference

### Connect to a Server

```bash
ssh user@host
ssh -i ~/.ssh/mykey user@host -p 2222
```

### Execute Remote Command

```bash
ssh user@host 'command here'
ssh user@host 'bash -s' < local-script.sh
```

### File Transfer

```bash
# SCP
scp local-file user@host:/remote/path
scp user@host:/remote/file ./local-path
scp -r local-dir/ user@host:/remote/path/

# Rsync (preferred for large transfers)
rsync -avz --progress local-dir/ user@host:/remote/path/
rsync -avz --delete local-dir/ user@host:/remote/path/  # mirror
rsync -avz -e 'ssh -p 2222' local/ user@host:/remote/
```

### SSH Tunnels

```bash
# Local forward: access remote:3306 via localhost:3306
ssh -L 3306:localhost:3306 user@host

# Remote forward: expose local:8080 on remote:9090
ssh -R 9090:localhost:8080 user@host

# SOCKS proxy
ssh -D 1080 user@host

# Background tunnel
ssh -fNL 3306:localhost:3306 user@host
```

### Key Management

```bash
# Generate key
ssh-keygen -t ed25519 -C "comment" -f ~/.ssh/keyname

# Copy key to server
ssh-copy-id -i ~/.ssh/keyname.pub user@host

# Add to agent
eval $(ssh-agent)
ssh-add ~/.ssh/keyname

# Test connection
ssh -T user@host
```

## Scripts

| Script                      | Purpose                            |
| --------------------------- | ---------------------------------- |
| `scripts/ssh-config-gen.sh` | Generate/update SSH config entries |
| `scripts/key-rotation.sh`   | Rotate SSH keys on remote hosts    |
| `scripts/tunnel-manager.sh` | Manage persistent SSH tunnels      |
| `scripts/rsync-deploy.sh`   | Deploy files via rsync with backup |

## Workflows

### 1. Set Up New Server Access

```bash
# Generate a dedicated key
ssh-keygen -t ed25519 -C "myserver" -f ~/.ssh/myserver

# Copy to server
ssh-copy-id -i ~/.ssh/myserver.pub root@1.2.3.4

# Add config entry
bash scripts/ssh-config-gen.sh myserver 1.2.3.4 root --key ~/.ssh/myserver --port 22

# Test
ssh myserver
```

### 2. Deploy Application via Rsync

```bash
bash scripts/rsync-deploy.sh ./dist/ user@server:/var/www/myapp/ --backup --exclude node_modules
```

### 3. Set Up Database Tunnel

```bash
# Start tunnel to access remote PostgreSQL
bash scripts/tunnel-manager.sh start db-tunnel user@server 5432:localhost:5432

# Check running tunnels
bash scripts/tunnel-manager.sh list

# Stop
bash scripts/tunnel-manager.sh stop db-tunnel
```

### 4. Rotate SSH Keys

```bash
bash scripts/key-rotation.sh myserver --new-key ~/.ssh/myserver-new
```

## SSH Config Patterns

### Basic Host

```
Host myserver
    HostName 1.2.3.4
    User root
    IdentityFile ~/.ssh/myserver
    Port 22
```

### Jump/Bastion Host

```
Host bastion
    HostName bastion.example.com
    User admin
    IdentityFile ~/.ssh/bastion

Host internal
    HostName 10.0.0.5
    User deploy
    ProxyJump bastion
```

### Wildcard Patterns

```
Host *.prod
    User deploy
    IdentityFile ~/.ssh/prod-key
    StrictHostKeyChecking yes

Host *.dev
    User dev
    StrictHostKeyChecking no
```

### Keep-Alive

```
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    AddKeysToAgent yes
```

## Troubleshooting

| Problem                       | Fix                                                               |
| ----------------------------- | ----------------------------------------------------------------- |
| Permission denied (publickey) | Check key permissions: `chmod 600 ~/.ssh/key`, `chmod 700 ~/.ssh` |
| Connection refused            | Check sshd running, port correct, firewall allows                 |
| Host key changed              | `ssh-keygen -R hostname` (verify it's legit first!)               |
| Agent forwarding not working  | Add `ForwardAgent yes` to config, ensure agent has key            |
| Tunnel port in use            | Kill old tunnel or use different local port                       |

## References

- `references/ssh-config-patterns.md` — Advanced SSH config examples
- `references/key-management.md` — Key types, best practices, rotation
- `references/tunnel-setups.md` — Common tunnel configurations
