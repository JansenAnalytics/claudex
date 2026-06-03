# secret-vault — Usage Reference

## CLI Examples

### Store a secret

```bash
node $HOME/projects/secret-vault/vault.cjs set GITHUB_TOKEN "your-token-here"
# ✓ Secret "GITHUB_TOKEN" stored.
```

### Retrieve a secret

```bash
node $HOME/projects/secret-vault/vault.cjs get GITHUB_TOKEN
# prints value to stdout
```

### Use in shell scripts

```bash
TOKEN=$(node $HOME/projects/secret-vault/vault.cjs get GITHUB_TOKEN)
curl -H "Authorization: Bearer $TOKEN" https://api.github.com/user
```

### List all secret names

```bash
node $HOME/projects/secret-vault/vault.cjs list
# GITHUB_TOKEN
# TELEGRAM_BOT_TOKEN
# NTFY_TOPIC_STOCK
```

### Delete a secret

```bash
node $HOME/projects/secret-vault/vault.cjs delete OLD_KEY
# ✓ Secret "OLD_KEY" deleted.
```

### Export encrypted backup

```bash
node $HOME/projects/secret-vault/vault.cjs export > ~/backup.enc
# File is encrypted — safe to store, useless without vault.key
```

### Health check

```bash
node $HOME/projects/secret-vault/vault.cjs check
# ✓ Vault OK — 5 secrets stored.
```

## Programmatic Usage in Scripts

```js
const {
  getSecret,
  setSecret,
  deleteSecret,
  listSecrets,
} = require(require("os").homedir() + "/projects/secret-vault/vault.cjs");

// Read a secret
const token = getSecret("GITHUB_TOKEN");
if (!token) throw new Error("GITHUB_TOKEN not in vault");

// Write a secret
setSecret("NEW_API_KEY", "value");

// List all names
const names = listSecrets();
console.log(names);

// Remove a secret
deleteSecret("OLD_KEY");
```

## Overwriting a Secret

Running `set` on an existing name overwrites it:

```bash
node vault.cjs set GITHUB_TOKEN "new-token"
```

## Restoring from Backup

To restore, you need both files:

- `backup.enc` → copy to `~/.openclaw/vault.enc`
- The original `~/.openclaw/vault.key`

Without the key, the backup is unreadable.
