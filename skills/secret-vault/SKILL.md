---
name: secret-vault
description: "Encrypted credential store — AES-256-GCM secured tokens and secrets in one place."
---

# secret-vault

Encrypted credential store — AES-256-GCM secured tokens and secrets in one place.

## What it does

Keeps API tokens, passwords, and other sensitive values in an encrypted file at `~/.openclaw/vault.enc`. Each secret has its own IV and auth tag so no two ciphertexts are alike, even for identical values.

The master key (`~/.openclaw/vault.key`) is 32 random bytes stored with `chmod 600`. Without it the vault is unreadable.

## Trigger phrases

- "store the token in the vault"
- "get X from the vault"
- "what secrets are in the vault?"
- "add X to the vault"
- "vault set / vault get / vault list"
- "encrypt and store"
- "use getSecret to fetch"
- "vault check" / "verify the vault"

## Primary file

```
/home/ajans/projects/secret-vault/vault.cjs
```

Symlink (or same file) also lives at:

```
/home/ajans/openclaw/skills/secret-vault/scripts/vault.cjs
```

## CLI quick reference

```bash
node vault.cjs set NAME "value"   # store / overwrite
node vault.cjs get NAME           # print decrypted value
node vault.cjs list               # names only, no values
node vault.cjs delete NAME        # remove secret
node vault.cjs export             # print encrypted JSON to stdout
node vault.cjs check              # verify integrity + count
```

## Programmatic usage

```js
const { getSecret } = require("/home/ajans/projects/secret-vault/vault.cjs");
const token = getSecret("GITHUB_TOKEN"); // returns string or null
```

## Key locations

| File                    | Purpose                | Permissions |
| ----------------------- | ---------------------- | ----------- |
| `~/.openclaw/vault.key` | 32-byte master key     | 600         |
| `~/.openclaw/vault.enc` | Encrypted secrets JSON | 600         |

## Security model

- AES-256-GCM — authenticated encryption (detects tampering)
- Unique random IV per secret (16 bytes)
- Auth tag per secret (16 bytes)
- Values never logged or printed in `list`
- Export blob is safe to back up; useless without the key

## References

- `references/usage.md` — full examples
- `references/security.md` — threat model
