//! Matrix client logic: build/persist, login + cross-signing bootstrap, the sync
//! loop with verified-only inbound, and encrypted verified-only send.
//!
//! All cryptography is delegated to matrix-rust-sdk (vodozemac). Reconciled
//! against matrix-sdk 0.17. The security-critical settings are in `build_client`:
//! the verified-only key-sharing strategy (sending) and the cross-signed trust
//! requirement (decryption).

use std::collections::HashMap;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use matrix_sdk::{
    config::SyncSettings,
    encryption::EncryptionSettings,
    event_handler::Ctx,
    ruma::events::room::{
        member::{MembershipState, StrippedRoomMemberEvent},
        message::{MessageType, OriginalSyncRoomMessageEvent},
    },
    ruma::{OwnedRoomId, UserId},
    store::RoomLoadSettings,
    Client, EncryptionState, Room, RoomState,
};
// The verified-only policy types the builder accepts live in matrix_sdk_base::crypto
// (not re-exported by matrix-sdk itself).
use matrix_sdk_base::crypto::{CollectStrategy, DecryptionSettings, TrustRequirement};

use crate::config::Config;
use crate::LoginOpts;

/// One decrypted, content-bearing inbound message — serialized verbatim onto the
/// SSE `/events` stream. The field names MUST match scripts/matrix-bridge.py's
/// `parse_event`.
#[derive(Clone, Debug, Serialize)]
pub struct InboundMsg {
    #[serde(rename = "type")]
    pub kind: &'static str, // always "message"
    pub room_id: String,
    pub event_id: String,
    pub sender: String,
    pub sender_verified: bool,
    pub body: String,
    pub ts: i64,
}

/// Shared state handed to the HTTP layer.
#[derive(Clone)]
pub struct AppState {
    pub client: Client,
    pub tx: broadcast::Sender<InboundMsg>,
    pub token: String,
    /// Pinned cross-signing master keys (`@user:server` -> base64). Enforced
    /// fail-closed on the outbound path (`send_text`).
    pub trusted_user_keys: HashMap<String, String>,
}

/// Persisted login session (access token + ids). Stored at data/matrix/session.json (0600).
#[derive(Serialize, Deserialize)]
struct StoredSession {
    session: matrix_sdk::authentication::matrix::MatrixSession,
}

/// Build a client with a persistent SQLite store and the verified-only crypto policy.
async fn build_client(homeserver: &str, store_dir: &std::path::Path) -> Result<Client> {
    std::fs::create_dir_all(store_dir)
        .with_context(|| format!("create store dir {}", store_dir.display()))?;
    harden_dir_perms(store_dir);

    // Cross-signing is bootstrapped EXPLICITLY in login() (reset_cross_signing), never
    // implicitly. auto_enable_cross_signing:false stops the SDK's post-login init task
    // (encryption/mod.rs spawn_initialization_task) from calling
    // bootstrap_cross_signing_if_needed, which would create a competing identity.
    // auto_enable_backups:false keeps that same init task from running the
    // recovery/secret-storage setup that would itself issue self /keys/query traffic.
    // BOTH must stay false together: the safety of login()'s bootstrap depends on no
    // background task issuing a self /keys/query during the cross-signing reset window
    // (see the fence + pre-sync drain in login()). Flipping either reopens that window.
    let encryption_settings = EncryptionSettings {
        auto_enable_cross_signing: false,
        auto_enable_backups: false,
        ..Default::default()
    };

    // ── SECURITY-CRITICAL: verified-devices-only ─────────────────────────────
    // Sending: IdentityBasedStrategy shares room keys ONLY with devices that are
    //   cross-signed by their owner (MSC4153; a device a hostile server injects
    //   is not cross-signed and therefore gets no keys).
    // Decrypting: CrossSigned means we only accept events from cross-signed
    //   sender devices.
    let client = Client::builder()
        .homeserver_url(homeserver)
        .sqlite_store(store_dir, None)
        .with_encryption_settings(encryption_settings)
        .with_room_key_recipient_strategy(CollectStrategy::IdentityBasedStrategy)
        .with_decryption_settings(DecryptionSettings {
            sender_device_trust_requirement: TrustRequirement::CrossSigned,
        })
        .build()
        .await
        .context("building matrix client")?;
    Ok(client)
}

/// One-time login: authenticate, persist the session, bootstrap cross-signing,
/// and print the bot device fingerprint (verify it in Element) plus the env lines.
pub async fn login(opts: LoginOpts) -> Result<()> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let workspace =
        std::env::var("CLAUDEX_WORKSPACE").unwrap_or_else(|_| format!("{home}/.claude-agent"));
    let store_dir = std::path::PathBuf::from(format!("{workspace}/data/matrix"));
    let session_file = store_dir.join("session.json");

    // `login` always provisions a FRESH device. The persistent crypto store
    // remembers the previous device, so a second `login` into a populated store
    // fails with "the account in the store doesn't match". Clear the store first
    // so re-running login is always safe (this is the from-scratch setup step;
    // `serve` is what restores an existing session).
    if store_dir.exists() {
        std::fs::remove_dir_all(&store_dir)
            .with_context(|| format!("clearing old store {}", store_dir.display()))?;
    }

    let client = build_client(&opts.homeserver, &store_dir).await?;

    client
        .matrix_auth()
        .login_username(&opts.user, &opts.password)
        .initial_device_display_name("claudex-sidecar")
        .await
        .context("login failed")?;

    // Persist the session so `serve` can restore without a new device each boot.
    let session = client
        .matrix_auth()
        .session()
        .ok_or_else(|| anyhow!("no session after login"))?;
    write_private(
        &session_file,
        &serde_json::to_vec_pretty(&StoredSession { session })?,
    )?;

    // ── Make the cross-signing bootstrap below safe on ANY account ───────────────
    // The SDK self-heals cross-signing while processing a /keys/query response for our
    // OWN user: if the server's public master key differs from our LOCAL private one it
    // DELETES the local private key (identities/manager.rs check_private_identity ->
    // PrivateCrossSigningIdentity::clear_if_differs, which nulls master_key only when
    // the local slot is populated AND differs — olm/signing/mod.rs). login queues a
    // mandatory self /keys/query (users_for_key_query always tracks our own user); it is
    // flushed by a sync's send_outgoing_requests. If that flush lands AFTER bootstrap has
    // written the fresh private key while the server still advertises a STALE identity,
    // the new key is wiped (the `master_key: None` we observed). Two guards prevent that:
    //
    //  (1) FENCE the background init task login_username spawned, so nothing syncs
    //      concurrently with our reset. (It is a no-op under our EncryptionSettings, but
    //      we enforce that rather than rely on it.)
    //  (2) DRAIN the queued self /keys/query now, while the private slot is still EMPTY,
    //      so clear_if_differs is a guaranteed no-op. Afterwards our own user is tracked +
    //      up-to-date, bootstrap does not re-queue it, and we deliberately issue no
    //      further self-query during login — the next one happens on `serve`, by which
    //      time the server has long committed the new identity (so it re-verifies, not
    //      wipes). This drain is load-bearing, so we REQUIRE it to succeed rather than
    //      discarding the result; if it cannot, we refuse to bootstrap.
    client.encryption().wait_for_e2ee_initialization_tasks().await;

    let mut drained = false;
    for attempt in 0..3u32 {
        match tokio::time::timeout(
            Duration::from_secs(30),
            client.sync_once(SyncSettings::default()),
        )
        .await
        {
            Ok(Ok(_)) => {
                drained = true;
                break;
            }
            Ok(Err(e)) => {
                tracing::warn!(attempt, error = %e, "pre-bootstrap sync failed; retrying")
            }
            Err(_) => tracing::warn!(attempt, "pre-bootstrap sync timed out; retrying"),
        }
        tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
    }
    if !drained {
        return Err(anyhow!(
            "the pre-bootstrap sync that drains the initial self /keys/query did not \
             succeed after retries; proceeding would risk the SDK wiping the new private \
             cross-signing key. Check homeserver/network connectivity and re-run `login`."
        ));
    }

    // Bootstrap (reset) cross-signing so the bot is a coherent identity the human
    // verifies once. Uploading the signing keys requires re-authentication: classic
    // homeservers use UIAA (password); matrix.org's new auth service (MAS) uses
    // OAuth 2.0 — the user must approve the upload at a browser URL. `auth()` then
    // polls the upload endpoint for up to ~2 minutes while approval happens.
    // Without cross-signing the bot has NO identity the human can verify.
    if let Some(handle) = client.encryption().reset_cross_signing().await? {
        use matrix_sdk::encryption::CrossSigningResetAuthType;
        use matrix_sdk::ruma::api::client::uiaa;
        match handle.auth_type() {
            CrossSigningResetAuthType::Uiaa(uiaa) => {
                let mut pw = uiaa::Password::new(
                    uiaa::UserIdentifier::Matrix(uiaa::MatrixUserIdentifier::new(opts.user.clone())),
                    opts.password.clone(),
                );
                pw.session = uiaa.session.clone();
                handle
                    .auth(Some(uiaa::AuthData::Password(pw)))
                    .await
                    .context("cross-signing upload (UIAA password) failed")?;
            }
            CrossSigningResetAuthType::OAuth(o) => {
                eprintln!("# ====================================================================");
                eprintln!("# ACTION REQUIRED — approve the bot's cross-signing setup in a browser:");
                eprintln!("#");
                eprintln!("#     {}", o.approval_url);
                eprintln!("#");
                eprintln!("# Open it while logged in as the BOT account and click approve/continue.");
                eprintln!("# This command will wait up to ~2 minutes for you to approve...");
                eprintln!("# ====================================================================");
                let mut oauth = uiaa::OAuth::new();
                oauth.session = o.session.clone();
                handle
                    .auth(Some(uiaa::AuthData::OAuth(oauth)))
                    .await
                    .context("cross-signing upload (OAuth approval) failed or timed out")?;
            }
        }
    }
    // Confirm the bootstrap persisted locally. is_complete() reads the LOCAL private
    // identity (all three keys), which bootstrap_cross_signing just wrote; handle.auth()
    // above returned Ok only after the homeserver returned 200 to the signing-keys
    // upload, i.e. the server has committed the new identity. We deliberately do NOT
    // sync again here: a post-reset sync would issue another self /keys/query, and if the
    // homeserver served a momentarily-stale identity (read-after-write lag) it would wipe
    // the just-created private key — irrecoverably, since only public keys live on the
    // server. The reconciling self-query instead happens on `serve`, by when the server
    // is consistent (it then re-marks our identity verified rather than clearing it).
    match client.encryption().cross_signing_status().await {
        Some(s) if s.is_complete() => eprintln!("# Cross-signing bootstrapped (complete)."),
        _ => {
            return Err(anyhow!(
                "cross-signing did not persist after bootstrap (local private master key \
                 missing) despite fencing the init task and draining the initial key query. \
                 The account's server-side cross-signing state is unusable for a clean \
                 bootstrap. Fix: create a FRESH bot account and run `login` once against it — \
                 with no prior server identity there is nothing for the SDK to self-heal \
                 against, so the bootstrap is deterministic."
            ));
        }
    }

    // Print the device fingerprint for the human to verify in Element.
    let device_id = client
        .device_id()
        .ok_or_else(|| anyhow!("no device id"))?
        .to_string();
    let fingerprint = match client.encryption().get_own_device().await {
        Ok(Some(dev)) => dev
            .ed25519_key()
            .map(|k| k.to_base64())
            .unwrap_or_else(|| "<unknown>".into()),
        _ => "<unknown>".into(),
    };

    println!("# Login OK. Verify this device in Element (Settings → Sessions):");
    println!("#   device_id  = {device_id}");
    println!("#   ed25519    = {fingerprint}");
    println!("# Then add these to ~/.claude-agent/.env (chmod 600):");
    println!("MATRIX_HOMESERVER_URL={}", opts.homeserver);
    println!("MATRIX_USER_ID={}", opts.user);
    println!("MATRIX_DEVICE_ID={device_id}");
    println!(
        "# MATRIX_ACCESS_TOKEN is stored in {}",
        session_file.display()
    );
    println!("# Pin YOUR cross-signing key (read it from your Element 'Security & Privacy'):");
    println!("# MATRIX_TRUSTED_USER_KEYS=@you:server=<your-master-cross-signing-key>");
    Ok(())
}

/// Run the daemon: restore the session, enforce the trusted-key pins, start the
/// HTTP server, and drive the sync loop (which feeds verified inbound to /events).
pub async fn serve(cfg: Config) -> Result<()> {
    let client = build_client(&cfg.homeserver_url, &cfg.store_dir).await?;

    // Restore the persisted session (no new device on restart).
    let bytes = std::fs::read(&cfg.session_file).with_context(|| {
        format!(
            "read session {} — run `matrix-sidecar login` first",
            cfg.session_file.display()
        )
    })?;
    let stored: StoredSession = serde_json::from_slice(&bytes).context("parse session.json")?;
    client
        .matrix_auth()
        .restore_session(stored.session, RoomLoadSettings::default())
        .await
        .context("restore_session")?;

    // Sanity: the restored session's user must match the configured MATRIX_USER_ID.
    if let Some(uid) = client.user_id() {
        if uid.as_str() != cfg.user_id {
            tracing::warn!(configured = %cfg.user_id, restored = %uid,
                "MATRIX_USER_ID does not match the restored session");
        }
    }

    // Startup pin check: logs whether each pinned user's server-advertised master
    // key matches. Best-effort and NON-fatal — identities are often unknown before
    // the first sync, and making boot fatal would fight systemd Restart=always.
    // The load-bearing ENFORCEMENT is on the data path (fail-closed): inbound in
    // `on_room_message` (drops mismatched senders) and outbound in `send_text`
    // (refuses to send when a pinned room member's key mismatches).
    verify_pins(&client, &cfg.trusted_user_keys).await;

    let (tx, _rx) = broadcast::channel::<InboundMsg>(256);

    // Inbound: decrypted room messages → broadcast → SSE subscribers.
    client.add_event_handler_context(tx.clone());
    // Operator pin map for the inbound handler (event handlers receive Ctx<T>,
    // not the HTTP AppState, so the pins travel as their own handler context).
    client.add_event_handler_context(TrustedKeys {
        pins: cfg.trusted_user_keys.clone(),
    });
    client.add_event_handler(on_room_message);
    // Auto-join rooms we're invited to, but only by an allowlisted user (fail-closed).
    client.add_event_handler_context(AutoJoin {
        access_file: cfg.access_file.clone(),
    });
    client.add_event_handler(on_stripped_member);

    let state = AppState {
        client: client.clone(),
        tx: tx.clone(),
        token: cfg.sidecar_token.clone(),
        trusted_user_keys: cfg.trusted_user_keys.clone(),
    };

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", cfg.port))
        .await
        .with_context(|| format!("bind 127.0.0.1:{}", cfg.port))?;
    tracing::info!(
        port = cfg.port,
        "matrix-sidecar HTTP listening on localhost"
    );
    let app = crate::server::router(state);
    let mut http = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!(error = %e, "http server exited");
        }
    });

    // The matrix-sdk sync future is large and not `Send`, so run it on THIS task
    // (inside select!) rather than via tokio::spawn (which requires Send).
    let sync_fut = client.sync(SyncSettings::default());
    tokio::pin!(sync_fut);

    tokio::select! {
        _ = tokio::signal::ctrl_c() => tracing::info!("shutting down (signal)"),
        r = &mut sync_fut => tracing::warn!("sync loop ended: {r:?}"),
        _ = &mut http => tracing::warn!("http task ended"),
    }
    http.abort();
    Ok(())
}

/// Pure forwarding predicate (unit-tested): only act on non-empty text from a
/// joined, **encrypted** room that we did not send ourselves.
pub(crate) fn should_forward(joined: bool, encrypted: bool, body: &str, is_self: bool) -> bool {
    joined && encrypted && !body.is_empty() && !is_self
}

/// Inbound-handler context carrying the operator's pinned cross-signing keys.
/// Event handlers receive `Ctx<T>` values, not the HTTP `AppState`, so the pins
/// travel as their own handler context (registered in `serve`).
#[derive(Clone)]
struct TrustedKeys {
    pins: HashMap<String, String>,
}

/// Pure pin decision (unit-tested). `advertised` is the user's current
/// server-advertised cross-signing master key (base64) or `None` if unknown;
/// `pinned` is the operator's configured pin for that user or `None` if the user
/// is not pinned. Fail-closed: a pinned user whose advertised key is missing or
/// different is rejected; an unpinned user is always accepted (unchanged behavior).
pub(crate) fn pin_ok(advertised: Option<&str>, pinned: Option<&str>) -> bool {
    match pinned {
        None => true,
        Some(p) => advertised == Some(p),
    }
}

/// The user's current server-advertised cross-signing master key (base64), or
/// `None`. Forces a fresh `/keys/query` (`request_user_identity`) so a stale local
/// cache cannot mask a server-side identity swap. FAIL-CLOSED: we deliberately do
/// NOT fall back to the local store — on a query error (which a hostile homeserver
/// can induce) reading the cache could return the OLD pinned key and hide the swap.
/// `None` (server has no identity, or the query failed) → pin check fails closed.
async fn fetch_master_key(client: &Client, uid: &UserId) -> Option<String> {
    match client.encryption().request_user_identity(uid).await {
        Ok(Some(id)) => id.master_key().get_first_key().map(|k| k.to_base64()),
        Ok(None) => None, // server currently advertises no cross-signing identity
        Err(_) => None,   // live query failed → fail closed, never trust the cache
    }
}

/// Event handler: forward content-bearing text messages from joined, encrypted
/// rooms (annotated with the sender's verification status). Receipts/typing/
/// self/cleartext are filtered out here.
async fn on_room_message(
    ev: OriginalSyncRoomMessageEvent,
    room: Room,
    client: Client,
    tx: Ctx<broadcast::Sender<InboundMsg>>,
    trusted: Ctx<TrustedKeys>,
) {
    let joined = room.state() == RoomState::Joined;
    let encrypted = matches!(room.encryption_state(), EncryptionState::Encrypted);
    let body = match ev.content.msgtype {
        MessageType::Text(t) => t.body,
        _ => return, // v1: text only (attachments annotated by the bridge later)
    };
    let is_self = Some(ev.sender.as_str()) == client.user_id().map(|u| u.as_str());
    if !should_forward(joined, encrypted, &body, is_self) {
        return;
    }
    // Operator pin enforcement (fail-closed). If the sender's cross-signing master
    // key is pinned via MATRIX_TRUSTED_USER_KEYS, drop the message unless the
    // homeserver currently advertises exactly that key. This catches a malicious or
    // compromised homeserver that swaps the human's whole cross-signing identity —
    // the device-level TrustRequirement::CrossSigned check alone would accept a
    // device cross-signed under the *swapped* identity. Unpinned senders unaffected.
    if let Some(pinned) = trusted.0.pins.get(ev.sender.as_str()) {
        let advertised = fetch_master_key(&client, &ev.sender).await;
        if !pin_ok(advertised.as_deref(), Some(pinned.as_str())) {
            tracing::error!(
                "dropping inbound: pinned sender's advertised cross-signing master key \
                 does not match MATRIX_TRUSTED_USER_KEYS (possible homeserver identity swap)"
            );
            return;
        }
    }
    // Cross-signed-sender is enforced at the DECRYPTION layer: build_client sets
    // TrustRequirement::CrossSigned, so a message from a non-cross-signed device
    // (e.g. one a hostile homeserver injected) fails to decrypt and never reaches
    // this handler. Any event we forward is therefore, by construction, from a
    // device cross-signed by its owner — so this flag is true.
    let sender_verified = true;

    let msg = InboundMsg {
        kind: "message",
        room_id: room.room_id().to_string(),
        event_id: ev.event_id.to_string(),
        sender: ev.sender.to_string(),
        sender_verified,
        body,
        ts: i64::from(ev.origin_server_ts.0),
    };
    // Best-effort: drop if no SSE subscriber is attached yet (bridge reconnects).
    let _ = tx.0.send(msg);
}

/// Context for the auto-join handler: the access-policy file used to gate invites.
#[derive(Clone)]
struct AutoJoin {
    access_file: std::path::PathBuf,
}

/// Auto-join a room we're invited to — but ONLY when the inviting user is on the
/// access allowlist (fail-closed, same `allowFrom` the bridge enforces). This
/// keeps the bot out of unsolicited / spam rooms. Replies remain separately gated
/// by the bridge's per-message access check.
async fn on_stripped_member(
    ev: StrippedRoomMemberEvent,
    room: Room,
    client: Client,
    cfg: Ctx<AutoJoin>,
) {
    // React only to an invite addressed to US.
    let me = match client.user_id() {
        Some(u) => u.to_owned(),
        None => return,
    };
    if ev.state_key != me || ev.content.membership != MembershipState::Invite {
        return;
    }
    if room.state() != RoomState::Invited {
        return;
    }
    if !inviter_allowed(&cfg.0.access_file, ev.sender.as_str()) {
        tracing::info!("ignoring room invite from a non-allowlisted user");
        return;
    }
    // The inviting server / our sync can lag right after the invite — retry a few times.
    for attempt in 0..3u32 {
        match room.join().await {
            Ok(_) => {
                tracing::info!("auto-joined an invited room");
                return;
            }
            Err(e) => {
                tracing::warn!(attempt, error = %e, "auto-join failed; retrying");
                tokio::time::sleep(Duration::from_secs(1u64 << attempt)).await;
            }
        }
    }
    tracing::error!("gave up auto-joining an invited room after retries");
}

/// Fail-closed allowlist read of the access file's `allowFrom`: allow if it
/// contains the sender or "*". Missing/invalid file → deny.
fn inviter_allowed(access_file: &std::path::Path, sender: &str) -> bool {
    let Ok(bytes) = std::fs::read(access_file) else {
        return false;
    };
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return false;
    };
    // Consistent with the bridge: an "open" policy accepts anyone.
    if v.get("policy").and_then(|p| p.as_str()) == Some("open") {
        return true;
    }
    match v.get("allowFrom").and_then(|a| a.as_array()) {
        Some(list) => list
            .iter()
            .any(|x| x.as_str() == Some("*") || x.as_str() == Some(sender)),
        None => false,
    }
}

/// Send an encrypted text message to a room. Verified-only is enforced by the
/// client's key-sharing strategy; we additionally refuse cleartext rooms and
/// fail-closed on a pinned-user cross-signing master-key mismatch.
pub async fn send_text(
    client: &Client,
    trusted: &HashMap<String, String>,
    room_id: &str,
    body: &str,
) -> Result<String> {
    use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
    let room_id: OwnedRoomId = room_id.parse().context("invalid room id")?;
    let room = client
        .get_room(&room_id)
        .ok_or_else(|| anyhow!("room not found / not joined"))?;
    let enc = room
        .latest_encryption_state()
        .await
        .context("encryption_state")?;
    if !matches!(enc, EncryptionState::Encrypted) {
        return Err(anyhow!("refusing to send to a non-encrypted room"));
    }
    // Operator pin enforcement (fail-closed): if a pinned user is a member of this
    // room, refuse to send unless the homeserver still advertises their pinned
    // cross-signing master key. This is belt-and-suspenders over IdentityBasedStrategy
    // (which already withholds keys from non-cross-signed devices): it additionally
    // refuses to emit ciphertext into a room whose human identity was swapped.
    for (user, pinned) in trusted {
        let uid = match UserId::parse(user) {
            Ok(u) => u,
            Err(_) => continue, // invalid pins are logged at startup by verify_pins
        };
        // Resolve membership explicitly. A genuine non-member (Ok(None)) legitimately
        // skips the check, but a membership-fetch ERROR must FAIL CLOSED — a hostile
        // homeserver could otherwise fail /members to skip the pin check and get us to
        // send. (`.ok().flatten()` would have collapsed the error into "not a member".)
        let member = room.get_member(&uid).await.with_context(|| {
            format!("refusing to send: cannot resolve membership for pinned user {user}")
        })?;
        if member.is_some() {
            let advertised = fetch_master_key(client, &uid).await;
            if !pin_ok(advertised.as_deref(), Some(pinned.as_str())) {
                return Err(anyhow!(
                    "refusing to send: pinned user {user} cross-signing master key mismatch \
                     (possible homeserver identity swap)"
                ));
            }
        }
    }
    let resp = room
        .send(RoomMessageEventContent::text_plain(body))
        .await
        .context("room.send")?;
    Ok(resp.response.event_id.to_string())
}

async fn verify_pins(client: &Client, trusted: &HashMap<String, String>) {
    for (user, pinned) in trusted {
        let uid = match UserId::parse(user) {
            Ok(u) => u,
            Err(_) => {
                tracing::error!(user, "MATRIX_TRUSTED_USER_KEYS: invalid user id");
                continue;
            }
        };
        match client.encryption().get_user_identity(&uid).await {
            Ok(Some(identity)) => {
                let advertised = identity.master_key().get_first_key().map(|k| k.to_base64());
                match advertised {
                    Some(k) if &k == pinned => {
                        tracing::info!(user, "pinned cross-signing key matches")
                    }
                    Some(_) => tracing::error!(
                        user,
                        "PINNED cross-signing key MISMATCH — refusing to trust this identity"
                    ),
                    None => tracing::warn!(user, "identity has no master key"),
                }
            }
            _ => tracing::warn!(user, "identity not yet known (will re-check after sync)"),
        }
    }
}

fn harden_dir_perms(dir: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
    }
}

fn write_private(path: &std::path::Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_predicate() {
        assert!(should_forward(true, true, "hi", false));
        assert!(!should_forward(false, true, "hi", false)); // not joined
        assert!(!should_forward(true, false, "hi", false)); // cleartext room
        assert!(!should_forward(true, true, "", false)); // empty body
        assert!(!should_forward(true, true, "hi", true)); // our own message
    }

    #[test]
    fn pin_ok_is_fail_closed() {
        // Unpinned user: always accepted (behavior unchanged for non-pinned senders).
        assert!(pin_ok(Some("ABC"), None));
        assert!(pin_ok(None, None));
        // Pinned user: accept ONLY an exact advertised-key match.
        assert!(pin_ok(Some("ABC"), Some("ABC")));
        assert!(!pin_ok(Some("XYZ"), Some("ABC"))); // server swapped the identity
        assert!(!pin_ok(None, Some("ABC"))); // advertised key unknown → fail closed
    }

    /// The serialized InboundMsg field names MUST match scripts/matrix-bridge.py's
    /// `parse_event` (cross-language contract). If this changes, the bridge breaks.
    #[test]
    fn inbound_msg_contract_matches_bridge() {
        let m = InboundMsg {
            kind: "message",
            room_id: "!r:s".into(),
            event_id: "$e".into(),
            sender: "@u:s".into(),
            sender_verified: true,
            body: "hi".into(),
            ts: 5,
        };
        let v: serde_json::Value = serde_json::to_value(&m).unwrap();
        assert_eq!(v["type"], "message");
        assert_eq!(v["room_id"], "!r:s");
        assert_eq!(v["event_id"], "$e");
        assert_eq!(v["sender"], "@u:s");
        assert_eq!(v["sender_verified"], true);
        assert_eq!(v["body"], "hi");
        assert_eq!(v["ts"], 5);
        assert_eq!(v.as_object().unwrap().len(), 7, "no extra fields leaked");
    }

    #[test]
    fn inviter_allowed_is_fail_closed() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("cx-inv-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("access.json");

        assert!(!inviter_allowed(&dir.join("nope.json"), "@you:s")); // missing → deny
        std::fs::File::create(&f)
            .unwrap()
            .write_all(br#"{"allowFrom":["@you:s"]}"#)
            .unwrap();
        assert!(inviter_allowed(&f, "@you:s")); // listed → allow
        assert!(!inviter_allowed(&f, "@stranger:s")); // unlisted → deny
        std::fs::File::create(&f)
            .unwrap()
            .write_all(br#"{"allowFrom":["*"]}"#)
            .unwrap();
        assert!(inviter_allowed(&f, "@anyone:s")); // wildcard → allow
        std::fs::File::create(&f)
            .unwrap()
            .write_all(br#"{"policy":"open","allowFrom":[]}"#)
            .unwrap();
        assert!(inviter_allowed(&f, "@anyone:s")); // open policy → allow
        std::fs::File::create(&f)
            .unwrap()
            .write_all(b"{not json")
            .unwrap();
        assert!(!inviter_allowed(&f, "@you:s")); // invalid → deny

        let _ = std::fs::remove_dir_all(&dir);
    }
}
