//! matrix-sidecar — E2EE Matrix transport for the Claudex Matrix channel.
//!
//! Owns ALL cryptography, persistence, cross-signing, and verified-only delivery
//! via Element's matrix-rust-sdk (vodozemac). Exposes a localhost-only HTTP API
//! that the Python bridge (scripts/matrix-bridge.py) drives. See ../README.md and
//! ../docs/rfcs/0001-matrix-channel.md.
//!
//! Subcommands:
//!   login --homeserver <url> --user <@bot:server>   one-time: log in, persist the
//!       session, bootstrap cross-signing, print the bot device fingerprint.
//!   serve                                            run the daemon (reads env).
//!
//! NOTE: this crate is written against the matrix-rust-sdk API and is intended to
//! be compiled and E2EE-acceptance-tested in your toolchain (it is not built in
//! the authoring sandbox). Version-sensitive SDK calls are marked `// VERIFY:`.

mod config;
mod matrix;
mod server;

use anyhow::{anyhow, Result};

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();

    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("login") => {
            let opts = parse_login_args(args)?;
            matrix::login(opts).await
        }
        Some("serve") => {
            let cfg = config::Config::from_env()?;
            matrix::serve(cfg).await
        }
        _ => {
            eprintln!("usage: matrix-sidecar <login|serve>");
            eprintln!("  login --homeserver <url> --user <@bot:server>");
            eprintln!("        (password via stdin or $MATRIX_LOGIN_PASSWORD)");
            eprintln!("  serve   reads MATRIX_* from env / ~/.claude-agent/.env");
            std::process::exit(2);
        }
    }
}

fn init_logging() {
    // Structured JSON logs to stderr; honor RUST_LOG (default: info).
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,matrix_sdk=warn"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

pub struct LoginOpts {
    pub homeserver: String,
    pub user: String,
    pub password: String,
}

fn parse_login_args(mut args: impl Iterator<Item = String>) -> Result<LoginOpts> {
    let (mut homeserver, mut user) = (None, None);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--homeserver" => homeserver = args.next(),
            "--user" => user = args.next(),
            other => return Err(anyhow!("unknown login arg: {other}")),
        }
    }
    let homeserver = homeserver.ok_or_else(|| anyhow!("--homeserver is required"))?;
    let user = user.ok_or_else(|| anyhow!("--user is required (e.g. @bot:matrix.org)"))?;

    // Password: prefer the env var (scriptable); otherwise read one stdin line.
    // (A one-time interactive step; the access token is what gets persisted.)
    let password = match std::env::var("MATRIX_LOGIN_PASSWORD") {
        Ok(p) if !p.is_empty() => p,
        _ => {
            eprintln!("Password for {user}: (input is read from stdin)");
            let mut line = String::new();
            std::io::stdin()
                .read_line(&mut line)
                .map_err(|e| anyhow!("failed to read password: {e}"))?;
            line.trim_end().to_string()
        }
    };
    if password.is_empty() {
        return Err(anyhow!("empty password"));
    }
    Ok(LoginOpts {
        homeserver,
        user,
        password,
    })
}
