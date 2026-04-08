---
name: cloud-deploy
description: "Provision and manage cloud servers on Hetzner, DigitalOcean, or AWS. Set up infrastructure, firewalls, DNS, and deploy applications."
---

# cloud-deploy

Provision and manage cloud servers on Hetzner, DigitalOcean, or AWS. Set up infrastructure, firewalls, DNS, and deploy applications.

## When to Use

- Creating VPS instances (Hetzner, DigitalOcean, AWS)
- Configuring firewalls and security groups
- Setting up DNS records
- Deploying applications to cloud
- Managing cloud infrastructure
- Initial server hardening

## Prerequisites

Install CLI tools as needed:

```bash
# Hetzner
brew install hcloud        # or: curl -sL https://github.com/hetznercloud/cli/releases/...

# DigitalOcean
brew install doctl         # then: doctl auth init

# AWS
brew install awscli        # then: aws configure
```

## Quick Reference

### Hetzner Cloud

```bash
# List server types
hcloud server-type list

# Create server
hcloud server create --name myserver --type cx22 --image ubuntu-24.04 --ssh-key mykey --location fsn1

# List servers
hcloud server list

# SSH in
hcloud server ssh myserver

# Delete
hcloud server delete myserver

# Firewall
hcloud firewall create --name web-fw
hcloud firewall add-rule web-fw --direction in --protocol tcp --port 80 --source-ips 0.0.0.0/0
hcloud firewall add-rule web-fw --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0
hcloud firewall apply-to-resource web-fw --type server --server myserver
```

### DigitalOcean

```bash
# Create droplet
doctl compute droplet create myserver \
    --size s-1vcpu-1gb --image ubuntu-24-04-x64 \
    --region ams3 --ssh-keys <fingerprint>

# List
doctl compute droplet list

# Delete
doctl compute droplet delete myserver

# Firewall
doctl compute firewall create --name web-fw \
    --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0 protocol:tcp,ports:80,address:0.0.0.0/0 protocol:tcp,ports:443,address:0.0.0.0/0" \
    --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0"
```

### AWS EC2

```bash
# Launch instance
aws ec2 run-instances --image-id ami-0123456789 \
    --instance-type t3.micro --key-name mykey \
    --security-group-ids sg-xxx --subnet-id subnet-xxx

# List
aws ec2 describe-instances --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]' --output table

# Terminate
aws ec2 terminate-instances --instance-ids i-xxx
```

## Scripts

| Script                      | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `scripts/hetzner-helper.sh` | Quick Hetzner server provisioning                 |
| `scripts/do-droplet.sh`     | DigitalOcean droplet lifecycle                    |
| `scripts/firewall-setup.sh` | Configure firewall rules (ufw-based)              |
| `scripts/server-harden.sh`  | Initial server hardening (SSH, fail2ban, updates) |

## Workflows

### 1. Provision a Hetzner Server

```bash
# Create with helper
bash scripts/hetzner-helper.sh create myapp cx22 ubuntu-24.04 fsn1

# Harden it
ssh root@<ip> 'bash -s' < scripts/server-harden.sh

# Set up firewall
ssh root@<ip> 'bash -s' < scripts/firewall-setup.sh -- --web --ssh
```

### 2. Full Deploy Pipeline

```bash
# 1. Create server
bash scripts/hetzner-helper.sh create prod-web cx22 ubuntu-24.04 fsn1

# 2. Get IP
IP=$(hcloud server ip prod-web)

# 3. Harden
ssh root@$IP 'bash -s' < scripts/server-harden.sh

# 4. Deploy app (using ssh-remote skill)
rsync -avz ./dist/ root@$IP:/var/www/myapp/

# 5. Set up reverse proxy, SSL, etc. on server
```

### 3. DigitalOcean Droplet

```bash
bash scripts/do-droplet.sh create myapp s-1vcpu-1gb ams3
```

## Server Sizing Guide

### Hetzner (Best value in EU)

| Type | vCPU | RAM  | Disk  | €/mo |
| ---- | ---- | ---- | ----- | ---- |
| cx22 | 2    | 4GB  | 40GB  | ~€4  |
| cx32 | 4    | 8GB  | 80GB  | ~€7  |
| cx42 | 8    | 16GB | 160GB | ~€14 |
| cx52 | 16   | 32GB | 320GB | ~€29 |

### DigitalOcean

| Type        | vCPU | RAM | Disk | $/mo |
| ----------- | ---- | --- | ---- | ---- |
| s-1vcpu-1gb | 1    | 1GB | 25GB | $6   |
| s-1vcpu-2gb | 1    | 2GB | 50GB | $12  |
| s-2vcpu-4gb | 2    | 4GB | 80GB | $24  |

### Recommendation

- **Personal projects / bots:** Hetzner cx22 (~€4/mo)
- **Small web apps:** Hetzner cx32 or DO s-2vcpu-4gb
- **Production with compliance needs:** AWS (more services, higher cost)

## References

- `references/provider-comparison.md` — Hetzner vs DO vs AWS
- `references/common-architectures.md` — Typical deployment patterns
- `references/initial-setup-guide.md` — Step-by-step new server setup
