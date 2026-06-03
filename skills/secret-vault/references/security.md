# secret-vault — Security Model

## Encryption

| Property  | Detail                                 |
| --------- | -------------------------------------- |
| Algorithm | AES-256-GCM                            |
| Key size  | 256 bits (32 bytes)                    |
| IV size   | 128 bits (16 bytes), random per secret |
| Auth tag  | 128 bits (16 bytes), per secret        |

AES-256-GCM is an _authenticated_ cipher — it guarantees both confidentiality (you can't read it) and integrity (you'll know if it's been tampered with). Attempting to decrypt tampered ciphertext raises an error.

## Key Storage

```
~/.openclaw/vault.key
  Mode: 0600 (owner read/write only)
  Content: 32 raw random bytes
  Generated: once, on first use
```

The key is stored as raw bytes (not hex/base64) and read directly into the crypto engine — no parsing, no string conversion, no risk of encoding bugs.

## Vault File

```
~/.openclaw/vault.enc
  Mode: 0600 (owner read/write only)
  Format: JSON array of entries
```

Each entry:

```json
{
  "name": "SECRET_NAME",
  "iv": "32-hex-chars (16 bytes)",
  "tag": "32-hex-chars (16 bytes)",
  "ciphertext": "hex-encoded encrypted value"
}
```

The vault file contains **no plaintext values**. The name is the only readable field — by design.

## What is Protected

✅ Protects against:

- Reading secrets from disk if the machine is compromised while off
- Accidentally leaking vault contents in logs or shell history
- Backup files being useful to an attacker (without the key)
- Tampered vault entries (GCM auth tag will reject them)

⚠️ Does NOT protect against:

- A running attacker who can read your home directory while the OS is live
  (they could read `vault.key` directly)
- Memory scraping while a process uses the secret
- Shell history if you type secrets inline on the command line

## Recommendations

1. **Back up `vault.key` separately** from `vault.enc`. Losing the key means losing all secrets.
2. **Do not commit `vault.key` to git**. The vault.enc is safe to commit; the key is not.
3. Use `export` to create encrypted backups — don't copy `vault.enc` without the key.
4. On shared machines, verify file permissions: `ls -la ~/.openclaw/`
