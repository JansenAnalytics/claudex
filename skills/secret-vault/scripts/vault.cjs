"use strict";

/**
 * secret-vault — AES-256-GCM encrypted credential store
 * No external dependencies. Node.js built-ins only.
 *
 * CLI usage:
 *   node vault.cjs set NAME "value"
 *   node vault.cjs get NAME
 *   node vault.cjs list
 *   node vault.cjs delete NAME
 *   node vault.cjs export
 *   node vault.cjs check
 *
 * Programmatic usage:
 *   const { getSecret } = require(require('os').homedir() + '/projects/secret-vault/vault.cjs');
 *   const token = getSecret('GITHUB_TOKEN');
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Paths ────────────────────────────────────────────────────────────────────
const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const KEY_PATH = path.join(OPENCLAW_DIR, "vault.key");
const VAULT_PATH = path.join(OPENCLAW_DIR, "vault.enc");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 16;
const TAG_BYTES = 16;

// ─── Key management ───────────────────────────────────────────────────────────

/**
 * Load existing master key, or generate and persist a new one.
 * The key file is set to mode 0600 (owner read/write only).
 */
function loadOrCreateKey() {
  if (!fs.existsSync(OPENCLAW_DIR)) {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(KEY_PATH)) {
    const raw = fs.readFileSync(KEY_PATH);
    if (raw.length !== 32) {
      throw new Error(`Corrupt key file at ${KEY_PATH}: expected 32 bytes, got ${raw.length}`);
    }
    return raw;
  }

  // First run — generate key
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}

// ─── Vault I/O ────────────────────────────────────────────────────────────────

function readVault() {
  if (!fs.existsSync(VAULT_PATH)) return [];
  try {
    const raw = fs.readFileSync(VAULT_PATH, "utf8").trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read vault at ${VAULT_PATH}: ${err.message}`);
  }
}

function writeVault(entries) {
  fs.writeFileSync(VAULT_PATH, JSON.stringify(entries, null, 2), { mode: 0o600 });
}

// ─── Crypto primitives ────────────────────────────────────────────────────────

function encryptValue(key, plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

function decryptValue(key, entry) {
  const iv = Buffer.from(entry.iv, "hex");
  const tag = Buffer.from(entry.tag, "hex");
  const ciphertext = Buffer.from(entry.ciphertext, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

// ─── Public API (programmatic) ────────────────────────────────────────────────

/**
 * Retrieve a secret by name. Returns the plaintext value or null if not found.
 * Throws on decryption failure (tampered data).
 */
function getSecret(name) {
  const key = loadOrCreateKey();
  const entries = readVault();
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;
  return decryptValue(key, entry);
}

/**
 * Store (or overwrite) a secret by name.
 */
function setSecret(name, value) {
  const key = loadOrCreateKey();
  const entries = readVault();
  const idx = entries.findIndex((e) => e.name === name);
  const encrypted = encryptValue(key, value);
  const record = { name, ...encrypted };
  if (idx >= 0) {
    entries[idx] = record;
  } else {
    entries.push(record);
  }
  writeVault(entries);
}

/**
 * Delete a secret by name. Returns true if deleted, false if not found.
 */
function deleteSecret(name) {
  const entries = readVault();
  const before = entries.length;
  const filtered = entries.filter((e) => e.name !== name);
  if (filtered.length === before) return false;
  writeVault(filtered);
  return true;
}

/**
 * List all secret names (never values).
 */
function listSecrets() {
  const entries = readVault();
  return entries.map((e) => e.name);
}

/**
 * Export the raw (still-encrypted) vault JSON. Safe to back up anywhere —
 * useless without the key file.
 */
function exportVault() {
  return readVault();
}

/**
 * Verify the vault is readable and return the count of stored secrets.
 */
function checkVault() {
  const key = loadOrCreateKey();
  const entries = readVault();
  // Try decrypting one entry to validate the key is correct
  if (entries.length > 0) {
    decryptValue(key, entries[0]); // will throw if key is wrong
  }
  return entries.length;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function cli() {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help") {
    console.log(`
secret-vault — encrypted credential store

Commands:
  set NAME "value"   Encrypt and store a secret
  get NAME           Decrypt and print a secret value
  list               List secret names (never values)
  delete NAME        Remove a secret
  export             Print encrypted vault JSON to stdout
  check              Verify vault integrity and show count
  help               Show this help message

Key file:   ${KEY_PATH}  (chmod 600)
Vault file: ${VAULT_PATH}  (chmod 600)
`);
    return;
  }

  try {
    switch (command) {
      case "set": {
        const [name, value] = args;
        if (!name || value === undefined) {
          console.error('Usage: vault.cjs set NAME "value"');
          process.exit(1);
        }
        setSecret(name, value);
        console.log(`✓ Secret "${name}" stored.`);
        break;
      }

      case "get": {
        const [name] = args;
        if (!name) {
          console.error("Usage: vault.cjs get NAME");
          process.exit(1);
        }
        const val = getSecret(name);
        if (val === null) {
          console.error(`Secret "${name}" not found.`);
          process.exit(1);
        }
        // Print value to stdout (no newline decoration)
        process.stdout.write(val + "\n");
        break;
      }

      case "list": {
        const names = listSecrets();
        if (names.length === 0) {
          console.log("(vault is empty)");
        } else {
          names.forEach((n) => console.log(n));
        }
        break;
      }

      case "delete": {
        const [name] = args;
        if (!name) {
          console.error("Usage: vault.cjs delete NAME");
          process.exit(1);
        }
        const deleted = deleteSecret(name);
        if (deleted) {
          console.log(`✓ Secret "${name}" deleted.`);
        } else {
          console.error(`Secret "${name}" not found.`);
          process.exit(1);
        }
        break;
      }

      case "export": {
        const data = exportVault();
        process.stdout.write(JSON.stringify(data, null, 2) + "\n");
        break;
      }

      case "check": {
        const count = checkVault();
        console.log(`✓ Vault OK — ${count} secret${count !== 1 ? "s" : ""} stored.`);
        break;
      }

      default:
        console.error(`Unknown command: ${command}. Run "vault.cjs help" for usage.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI if invoked directly; otherwise export API
if (require.main === module) {
  cli();
} else {
  module.exports = { getSecret, setSecret, deleteSecret, listSecrets, exportVault, checkVault };
}
