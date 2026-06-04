//! Configuration, read from the environment (the systemd unit loads
//! `~/.claude-agent/.env`). Pure std — no Matrix types here.

use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub homeserver_url: String,
    pub user_id: String,
    pub sidecar_token: String,
    pub port: u16,
    pub store_dir: PathBuf,
    pub session_file: PathBuf,
    /// Access policy file (shared with the bridge). The sidecar reads its
    /// `allowFrom` to decide which inviters' room invites to auto-join.
    pub access_file: PathBuf,
    /// Pinned cross-signing master keys: user_id -> base64 master key. The
    /// sidecar refuses to trust (share keys with / accept) a user whose
    /// server-advertised master key does not match the pinned value.
    pub trusted_user_keys: HashMap<String, String>,
}

impl Config {
    /// Read configuration from the process environment.
    pub fn from_env() -> Result<Self> {
        Self::from_getter(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
    }

    /// Pure constructor over a key→value getter, so configuration parsing is
    /// unit-testable without mutating the (process-global) environment.
    pub fn from_getter(get: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let home = get("HOME").unwrap_or_else(|| ".".into());
        let workspace = get("CLAUDEX_WORKSPACE").unwrap_or_else(|| format!("{home}/.claude-agent"));
        let store_dir = PathBuf::from(format!("{workspace}/data/matrix"));
        let session_file = store_dir.join("session.json");
        let access_file = get("MATRIX_ACCESS_FILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(format!("{home}/.claude/channels/matrix/access.json"))
            });
        let req = |key: &str| get(key).ok_or_else(|| anyhow!("required env var {key} is not set"));

        Ok(Self {
            homeserver_url: req("MATRIX_HOMESERVER_URL")?,
            user_id: req("MATRIX_USER_ID")?,
            sidecar_token: req("MATRIX_SIDECAR_TOKEN")?,
            port: get("MATRIX_SIDECAR_PORT")
                .and_then(|s| s.parse().ok())
                .unwrap_or(8765),
            store_dir,
            session_file,
            access_file,
            trusted_user_keys: parse_trusted(&get("MATRIX_TRUSTED_USER_KEYS").unwrap_or_default()),
        })
    }
}

/// Parse `@you:server=KEY,@other:server=KEY2` into a map.
fn parse_trusted(s: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for pair in s.split(',') {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        if let Some((u, k)) = pair.split_once('=') {
            let (u, k) = (u.trim(), k.trim());
            if !u.is_empty() && !k.is_empty() {
                m.insert(u.to_string(), k.to_string());
            }
        }
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;

    fn getter(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k| map.get(k).cloned()
    }

    const MIN: &[(&str, &str)] = &[
        ("HOME", "/h"),
        ("MATRIX_HOMESERVER_URL", "https://h"),
        ("MATRIX_USER_ID", "@b:s"),
        ("MATRIX_SIDECAR_TOKEN", "tok"),
    ];

    #[test]
    fn defaults_and_paths() {
        let c = Config::from_getter(getter(MIN)).unwrap();
        assert_eq!(c.port, 8765);
        assert_eq!(c.store_dir, PathBuf::from("/h/.claude-agent/data/matrix"));
        assert_eq!(
            c.session_file,
            PathBuf::from("/h/.claude-agent/data/matrix/session.json")
        );
        assert!(c.trusted_user_keys.is_empty());
        assert_eq!(
            c.access_file,
            PathBuf::from("/h/.claude/channels/matrix/access.json")
        );
    }

    #[test]
    fn missing_required_errors() {
        for missing in [
            "MATRIX_HOMESERVER_URL",
            "MATRIX_USER_ID",
            "MATRIX_SIDECAR_TOKEN",
        ] {
            let pairs: Vec<(&str, &str)> =
                MIN.iter().copied().filter(|(k, _)| *k != missing).collect();
            let err = Config::from_getter(getter(&pairs)).unwrap_err().to_string();
            assert!(
                err.contains(missing),
                "expected error to mention {missing}, got: {err}"
            );
        }
    }

    #[test]
    fn port_and_workspace_overrides() {
        let mut pairs = MIN.to_vec();
        pairs.push(("CLAUDEX_WORKSPACE", "/w"));
        pairs.push(("MATRIX_SIDECAR_PORT", "9000"));
        let c = Config::from_getter(getter(&pairs)).unwrap();
        assert_eq!(c.port, 9000);
        assert_eq!(c.store_dir, PathBuf::from("/w/data/matrix"));
    }

    #[test]
    fn bad_port_falls_back_to_default() {
        let mut pairs = MIN.to_vec();
        pairs.push(("MATRIX_SIDECAR_PORT", "not-a-number"));
        assert_eq!(Config::from_getter(getter(&pairs)).unwrap().port, 8765);
    }

    #[test]
    fn parse_trusted_keys() {
        let m = parse_trusted("@you:s=ABC, @b:s=DEF ,bad,=,x=");
        assert_eq!(m.get("@you:s"), Some(&"ABC".to_string()));
        assert_eq!(m.get("@b:s"), Some(&"DEF".to_string()));
        assert_eq!(m.len(), 2); // "bad", "=", "x=" rejected
    }
}
