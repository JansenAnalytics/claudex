---
name: secrets-manager
description: "Manage secrets and environment variables securely: .env files, encrypted vaults, key rotation, secret scanning. Use when: setting up environment variables, managing API keys, rotating secrets, scan..."
---

# secrets-manager

Manage secrets and environment variables securely: .env files, encrypted vaults, key rotation, secret scanning. Use when: setting up environment variables, managing API keys, rotating secrets, scanning repos for leaked credentials, or configuring secret storage.

## Workflows

### Generate .env file from template

```bash
bash scripts/env-generator.sh --template .env.example --output .env
```

Reads `.env.example`, prompts for missing values, writes `.env` with proper permissions (600).

### Validate .env file

```bash
bash scripts/env-generator.sh --validate .env --template .env.example
```

Checks all required keys exist, flags empty values, warns about insecure patterns.

### Scan repo for leaked secrets

```bash
bash scripts/secret-scanner.sh [directory]
```

Scans files for API keys, tokens, passwords, private keys using regex patterns. Respects `.gitignore`. Returns exit code 1 if secrets found.

### Create .env template from existing .env

```bash
bash scripts/env-template-creator.sh .env > .env.example
```

Strips values, keeps keys and comments, adds type hints.

## Scripts

| Script                            | Purpose                          |
| --------------------------------- | -------------------------------- |
| `scripts/env-generator.sh`        | Generate and validate .env files |
| `scripts/secret-scanner.sh`       | Scan repos for leaked secrets    |
| `scripts/env-template-creator.sh` | Create .env.example from .env    |

## References

| File                               | Contents                                      |
| ---------------------------------- | --------------------------------------------- |
| `references/secret-patterns.md`    | Regex patterns for detecting secrets          |
| `references/env-best-practices.md` | .env file best practices and vault comparison |
