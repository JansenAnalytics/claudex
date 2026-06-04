#!/bin/bash
# matrix-setup.sh — one guided, idempotent installer that takes a CLEAN VPS to a
# working, end-to-end-encrypted Claudex Matrix channel.
#
# It installs ALL prerequisites (build tools, Rust, Claude Code), authenticates
# Claude, creates the Claudex workspace, builds the E2EE sidecar, logs the bot in
# (cross-signing bootstrap), pins your cross-signing key, writes the access
# allowlist, installs + starts the sidecar and bridge as user services, and
# health-checks the result.
#
# Re-runnable: every step detects what is already done and skips it. It never
# clobbers an existing login session / crypto store or unrelated .env keys.
#
# Usage:
#   bash scripts/matrix-setup.sh [options]
#     --homeserver URL     pre-seed the homeserver (default https://matrix.org)
#     --user @bot:server   pre-seed the bot Matrix ID
#     --human @you:server  pre-seed YOUR Matrix ID (allowlist + key pin)
#     --relogin            force a fresh `login` even if a session exists
#     --reuse-session      skip `login`; require an existing session.json
#     --no-install-deps    skip the prerequisite-install layer (already provisioned)
#     -h | --help          show this help
#
# The bot PASSWORD is never passed on the command line. `login` reads it from
# stdin, or from $MATRIX_LOGIN_PASSWORD if you exported it yourself.
set -euo pipefail

# ── Resolve locations ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
: "${MATRIX_SIDECAR_PORT:=8765}"

# ── Options ──────────────────────────────────────────────────────────────────
HS=""; BOT_USER=""; HUMAN_USER=""
RELOGIN=0; REUSE_SESSION=0; INSTALL_DEPS=1
while [ $# -gt 0 ]; do
    case "$1" in
        --homeserver) HS="$2"; shift 2 ;;
        --user) BOT_USER="$2"; shift 2 ;;
        --human) HUMAN_USER="$2"; shift 2 ;;
        --relogin) RELOGIN=1; shift ;;
        --reuse-session) REUSE_SESSION=1; shift ;;
        --no-install-deps) INSTALL_DEPS=0; shift ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

# ── Pretty output ────────────────────────────────────────────────────────────
say()  { printf '%s\n' "$*"; }
step() { printf '\n▸ %s\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
warn() { printf '  ⚠️  %s\n' "$*"; }
die()  { printf '  ❌ %s\n' "$*" >&2; exit 1; }
# All prompts must tolerate a non-interactive stdin (curl|bash, CI, systemd): under
# `set -e` a bare `read` that hits EOF would abort the whole script silently. confirm
# no-ops to "no" and pause no-ops; value prompts (ask) return empty so the existing
# `die` checks fail loudly instead of aborting mid-read.
confirm() { # confirm "prompt" → 0 if yes
    [ -t 0 ] || return 1
    local r; read -r -p "  $* [y/N] " r || return 1; [[ "$r" =~ ^[Yy] ]]
}
pause() { [ -t 0 ] || return 0; read -r -p "  ↳ $* (press Enter to continue) " _ || true; }
ask() { # ask "prompt" VARNAME  — reads into VARNAME, empty on non-tty/EOF
    local __p="$1" __v="$2" __r=""
    [ -t 0 ] && read -r -p "  $__p" __r || true
    printf -v "$__v" '%s' "$__r"
}

# ── Secret-safe .env upsert (never clobbers other keys, never echoes values) ──
env_file() { printf '%s/.env' "$WORKSPACE"; }
env_upsert() { # env_upsert KEY VALUE
    local key="$1" val="$2" file tmp
    file="$(env_file)"; mkdir -p "$WORKSPACE"; touch "$file"; chmod 600 "$file"
    tmp="$(mktemp "${file}.XXXXXX")"; chmod 600 "$tmp"
    grep -v -- "^${key}=" "$file" > "$tmp" 2>/dev/null || true
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
    mv "$tmp" "$file"; chmod 600 "$file"
    ok "wrote ${key} to .env"
}
env_has() { grep -q -- "^$1=" "$(env_file)" 2>/dev/null; }
env_get() { grep -- "^$1=" "$(env_file)" 2>/dev/null | head -1 | cut -d= -f2-; }

# Tests source this file with MATRIX_SETUP_LIB_ONLY=1 to exercise the helpers
# above without running the installer.
if [ "${MATRIX_SETUP_LIB_ONLY:-}" = "1" ]; then return 0 2>/dev/null || exit 0; fi

say "╔══════════════════════════════════════════════╗"
say "║      Claudex — Matrix (E2EE) setup           ║"
say "╚══════════════════════════════════════════════╝"
say "Workspace: $WORKSPACE"

# ── Step -1: install prerequisites ───────────────────────────────────────────
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

os_pkgs_present() {
    command -v cc >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1 || return 1
    command -v pkg-config >/dev/null 2>&1 || return 1
    # cmake is required to build aws-lc-sys (matrix-sdk's TLS/crypto backend); a
    # box with gcc but no cmake would otherwise pass and then fail the sidecar build.
    command -v cmake >/dev/null 2>&1 || return 1
    for c in curl git python3 openssl; do command -v "$c" >/dev/null 2>&1 || return 1; done
    return 0
}

install_os_packages() {
    local pm=""
    for p in apt-get dnf yum pacman zypper; do command -v "$p" >/dev/null 2>&1 && { pm="$p"; break; }; done
    if [ -z "$pm" ]; then
        warn "no supported package manager found — ensure these exist: a C toolchain, pkg-config, cmake, clang/libclang, nasm, curl, git, tmux, python3, openssl, cron"
        return 0
    fi
    # cmake + clang/libclang + nasm are build deps of aws-lc-sys (the crypto backend
    # matrix-sdk's TLS pulls in); without them `cargo build` fails on a clean box.
    say "  Installing system packages via $pm (sudo: ${SUDO:-none})..."
    case "$pm" in
        apt-get) $SUDO apt-get update -y && $SUDO apt-get install -y \
            build-essential pkg-config cmake clang libclang-dev nasm \
            curl git tmux python3 openssl ca-certificates cron ;;
        dnf|yum) $SUDO "$pm" install -y \
            gcc gcc-c++ make pkgconf-pkg-config cmake clang clang-devel nasm \
            curl git tmux python3 openssl ca-certificates cronie ;;
        pacman)  $SUDO pacman -Sy --needed --noconfirm \
            base-devel cmake clang nasm curl git tmux python openssl cronie ;;
        zypper)  $SUDO zypper --non-interactive install -t pattern devel_basis || true
                 $SUDO zypper --non-interactive install \
                    cmake clang7-devel nasm curl git tmux python3 openssl ca-certificates cron ;;
    esac
}

if [ "$INSTALL_DEPS" -eq 1 ]; then
    step "Installing prerequisites (clean-VPS setup)"
    if os_pkgs_present; then
        ok "system build tools already present"
    else
        install_os_packages && ok "system packages installed"
    fi

    # Rust (per-user, via rustup) — needed to build the sidecar.
    if ! command -v cargo >/dev/null 2>&1; then
        [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env" || true
    fi
    if ! command -v cargo >/dev/null 2>&1; then
        say "  Installing Rust via rustup..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        . "$HOME/.cargo/env"
        ok "Rust installed ($(cargo --version 2>/dev/null || echo cargo))"
    else
        ok "Rust present ($(cargo --version 2>/dev/null || echo cargo))"
    fi

    # Claude Code CLI.
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    if ! command -v claude >/dev/null 2>&1; then
        say "  Installing Claude Code..."
        curl -fsSL https://claude.ai/install.sh | bash
        export PATH="$HOME/.local/bin:$PATH"
        command -v claude >/dev/null 2>&1 && ok "Claude Code installed ($(claude --version 2>/dev/null))" \
            || die "Claude Code install did not put 'claude' on PATH; open a new shell and re-run, or add ~/.local/bin to PATH"
    else
        ok "Claude Code present ($(claude --version 2>/dev/null))"
    fi
else
    warn "skipping prerequisite install (--no-install-deps)"
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env" || true
fi

command -v openssl >/dev/null 2>&1 || die "openssl is required (token generation)"
command -v cargo   >/dev/null 2>&1 || die "cargo is required (build the sidecar) — see https://rustup.rs"
command -v claude  >/dev/null 2>&1 || die "claude is required — curl -fsSL https://claude.ai/install.sh | bash"

# ── Step 0: authenticate Claude (the daemon runs `claude -p`) ─────────────────
step "Authenticating Claude (Max/Pro subscription)"
if claude auth status >/dev/null 2>&1; then
    ok "Claude already authenticated"
else
    say "  A browser sign-in is required once. The command below prints a URL —"
    say "  open it (on any device), approve, and paste the code back here."
    say "  (Headless box? 'claude setup-token' is an alternative; see docs/matrix-setup.md.)"
    pause "ready to sign in to Claude"
    claude auth login --claudeai || true
    claude auth status >/dev/null 2>&1 || die "Claude is still not authenticated — re-run 'claude auth login' then this script"
    ok "Claude authenticated"
fi

# ── Step 0b: create the Claudex workspace (reuse bootstrap.sh, non-interactive) ─
step "Creating the Claudex workspace"
if [ -x "$WORKSPACE/scripts/start-claudex.sh" ] && [ -f "$WORKSPACE/data/channel" ]; then
    ok "workspace already provisioned — skipping bootstrap"
else
    CLAUDEX_CHANNEL=matrix \
    CLAUDEX_FROM_MATRIX_SETUP=1 \
    CLAUDEX_NONINTERACTIVE=1 \
    CLAUDEX_EMBEDDING_PROVIDER="${CLAUDEX_EMBEDDING_PROVIDER:-none}" \
        bash "$REPO_DIR/scripts/bootstrap.sh"
    ok "workspace created"
fi
# Make sure this script is available inside the workspace for future re-runs.
cp "$SCRIPT_DIR/matrix-setup.sh" "$WORKSPACE/scripts/" 2>/dev/null && chmod +x "$WORKSPACE/scripts/matrix-setup.sh" || true

# ── Step 1: build the sidecar (idempotent) ───────────────────────────────────
step "Building the E2EE sidecar"
SIDECAR_DIR="$WORKSPACE/matrix-sidecar"
[ -d "$SIDECAR_DIR" ] || SIDECAR_DIR="$REPO_DIR/matrix-sidecar"
SIDECAR_BIN="$SIDECAR_DIR/target/release/matrix-sidecar"
if [ -x "$SIDECAR_BIN" ]; then
    ok "sidecar already built: $SIDECAR_BIN"
else
    ( cd "$SIDECAR_DIR" && cargo build --release ) || die "sidecar build failed"
    ok "sidecar built"
fi

# ── Step 2: collect identities ───────────────────────────────────────────────
step "Matrix account details"
[ -n "$HS" ]  || HS="$(env_get MATRIX_HOMESERVER_URL || true)"
[ -n "$HS" ]  || { ask "Homeserver URL [https://matrix.org]: " HS; HS="${HS:-https://matrix.org}"; }
[ -n "$BOT_USER" ] || BOT_USER="$(env_get MATRIX_USER_ID || true)"
[ -n "$BOT_USER" ] || ask "BOT Matrix ID (e.g. @claudex-bot:matrix.org): " BOT_USER
[ -n "$BOT_USER" ] || die "bot Matrix ID is required (pass --user or run on a terminal)"
[ -n "$HUMAN_USER" ] || ask "YOUR Matrix ID — the human who will chat with the bot (e.g. @you:matrix.org): " HUMAN_USER
[ -n "$HUMAN_USER" ] || die "your Matrix ID is required (pass --human or run on a terminal)"
say "  Bot:   $BOT_USER"
say "  Human: $HUMAN_USER"
[ "$BOT_USER" = "$HUMAN_USER" ] && die "bot and human must be different accounts"
confirm "Has the BOT account ($BOT_USER) already been created on $HS?" || \
    die "create the bot account first (register $BOT_USER on $HS), then re-run"

# ── Step 3: sidecar token + base .env ────────────────────────────────────────
step "Configuring .env"
env_upsert MATRIX_HOMESERVER_URL "$HS"
env_upsert MATRIX_USER_ID "$BOT_USER"
if env_has MATRIX_SIDECAR_TOKEN; then
    ok "MATRIX_SIDECAR_TOKEN already set — keeping it (regenerating would break a running bridge)"
else
    env_upsert MATRIX_SIDECAR_TOKEN "$(openssl rand -hex 32)"
fi

# ── Step 5 (before invite): access allowlist ─────────────────────────────────
# Written before the sidecar starts so its fail-closed auto-join accepts the human.
step "Writing the access allowlist"
ACCESS_DIR="$HOME/.claude/channels/matrix"
ACCESS_FILE="${MATRIX_ACCESS_FILE:-$ACCESS_DIR/access.json}"
if [ -f "$ACCESS_FILE" ]; then
    ok "access.json exists — leaving it as-is ($ACCESS_FILE)"
else
    mkdir -p "$(dirname "$ACCESS_FILE")"
    atmp="$(mktemp "${ACCESS_FILE}.XXXXXX")"; chmod 600 "$atmp"
    cat > "$atmp" <<JSON
{
  "policy": "allowlist",
  "allowFrom": ["$HUMAN_USER"],
  "roomAllowFrom": []
}
JSON
    mv "$atmp" "$ACCESS_FILE"; chmod 600 "$ACCESS_FILE"
    ok "wrote $ACCESS_FILE (allowFrom: $HUMAN_USER)"
fi

# ── Step 4: login (idempotent) ───────────────────────────────────────────────
step "Logging the bot in (cross-signing bootstrap)"
SESSION_FILE="$WORKSPACE/data/matrix/session.json"
if [ "$REUSE_SESSION" -eq 1 ]; then
    [ -f "$SESSION_FILE" ] || die "--reuse-session given but no session at $SESSION_FILE"
    ok "reusing existing session (--reuse-session)"
elif [ -f "$SESSION_FILE" ] && [ "$RELOGIN" -eq 0 ]; then
    ok "existing session found — skipping login (use --relogin to force a fresh device)"
else
    say "  This will: log in, reset+upload cross-signing, and (on matrix.org) print an"
    say "  OAuth APPROVAL URL — open it in a browser signed in as the BOT and approve."
    say "  The bot password is read from stdin (or \$MATRIX_LOGIN_PASSWORD); it is never"
    say "  shown or stored. Capture the printed 'ed25519' fingerprint for verification."
    pause "ready to log in as $BOT_USER"
    CLAUDEX_WORKSPACE="$WORKSPACE" "$SIDECAR_BIN" login --homeserver "$HS" --user "$BOT_USER" \
        || die "login failed — see the error above (a polluted account may need a fresh bot account)"
    ok "login + cross-signing complete"
fi

# ── Step 6: install + start the sidecar service ──────────────────────────────
step "Installing the sidecar service"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cp "$REPO_DIR/systemd/matrix-sidecar.service" "$UNIT_DIR/"
systemctl --user daemon-reload
command -v loginctl >/dev/null 2>&1 && loginctl enable-linger "$(whoami)" 2>/dev/null || true
if systemctl --user is-active --quiet matrix-sidecar; then
    systemctl --user restart matrix-sidecar
    ok "matrix-sidecar restarted (picks up new .env)"
else
    systemctl --user enable --now matrix-sidecar
    ok "matrix-sidecar enabled + started"
fi

# ── Step 7: create the room in Element ───────────────────────────────────────
step "Set up the room in Element (manual, ~1 min)"
say "  1. In Element (as $HUMAN_USER), create a NEW end-to-end-ENCRYPTED room."
say "  2. Invite the bot: $BOT_USER  (it auto-joins — allowlisted above)."
say "  3. (Optional) The bot is an automated account, so Element's interactive"
say "     (emoji) verification will NOT complete with it — that is expected, not a"
say "     fault. If you want a manual check, open the bot's session and confirm its"
say "     key matches the ed25519 fingerprint 'login' printed."
say "  You do NOT need to copy your cross-signing key from Element — the next step"
say "  fetches it for you."
pause "created the encrypted room and invited the bot"

# Fetch HUMAN_USER's master cross-signing key from the homeserver, using the bot's
# session token (the key is PUBLIC). Prints the base64 key, or nothing on failure.
fetch_human_master_key() {
    local sess="$WORKSPACE/data/matrix/session.json"
    [ -f "$sess" ] || return 1
    HUMAN_USER="$HUMAN_USER" HS="$HS" SESS="$sess" python3 - <<'PY' 2>/dev/null
import json, os, sys, urllib.request
try:
    s = json.load(open(os.environ["SESS"]))
    tok = s.get("access_token") or s.get("accessToken")
    hs = (s.get("homeserver") or os.environ.get("HS") or "https://matrix.org").rstrip("/")
    uid = os.environ["HUMAN_USER"]
    if not tok:
        sys.exit(1)
    req = urllib.request.Request(
        hs + "/_matrix/client/v3/keys/query",
        data=json.dumps({"device_keys": {uid: []}}).encode(),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
    )
    r = json.load(urllib.request.urlopen(req, timeout=10))
    vals = list(((r.get("master_keys") or {}).get(uid) or {}).get("keys", {}).values())
    if vals:
        print(vals[0])
except Exception:
    sys.exit(1)
PY
}

# ── Step 8: pin your cross-signing key (enforced fail-closed by the sidecar) ──
step "Pinning your cross-signing key"
if env_has MATRIX_TRUSTED_USER_KEYS && [ -n "$(env_get MATRIX_TRUSTED_USER_KEYS)" ]; then
    ok "MATRIX_TRUSTED_USER_KEYS already set"
    confirm "Overwrite the existing pin?" && PIN_NOW=1 || PIN_NOW=0
else
    PIN_NOW=1
fi
if [ "${PIN_NOW:-0}" -eq 1 ]; then
    HUMAN_KEY=""
    AUTO_KEY="$(fetch_human_master_key || true)"
    if [ -n "$AUTO_KEY" ]; then
        say "  Your account's master cross-signing key, as the homeserver advertises it:"
        say ""
        say "      $AUTO_KEY"
        say ""
        say "  This PUBLIC key becomes your trust-on-first-use baseline: from now on the"
        say "  bot DROPS your messages and REFUSES to send if the server ever advertises a"
        say "  different master key for you (identity-swap defense). Press Enter to accept"
        say "  it, or paste a key you verified out-of-band."
        ask "Master key [Enter = accept the value above]: " HUMAN_KEY
        [ -n "$HUMAN_KEY" ] || HUMAN_KEY="$AUTO_KEY"
    else
        warn "couldn't fetch your key automatically (is the sidecar running / are you in a room with the bot?)."
        say "  Paste it manually (Element → Settings → Security & Privacy), or set"
        say "  MATRIX_TRUSTED_USER_KEYS later and restart matrix-sidecar."
        ask "Paste YOUR master cross-signing key (base64): " HUMAN_KEY
    fi
    [ -n "$HUMAN_KEY" ] || die "no key entered — set MATRIX_TRUSTED_USER_KEYS later and restart matrix-sidecar"
    env_upsert MATRIX_TRUSTED_USER_KEYS "${HUMAN_USER}=${HUMAN_KEY}"
    systemctl --user restart matrix-sidecar
    ok "pin set and sidecar restarted (enforcement live)"
fi

# ── Step 9: select channel + start the bridge ────────────────────────────────
step "Starting the Matrix bridge"
mkdir -p "$WORKSPACE/data"; echo matrix > "$WORKSPACE/data/channel"
if [ -f "$REPO_DIR/rules/matrix.md" ]; then
    mkdir -p "$WORKSPACE/.claude/rules"; cp "$REPO_DIR/rules/matrix.md" "$WORKSPACE/.claude/rules/" 2>/dev/null || true
fi
if [ -f "$UNIT_DIR/claudex.service" ]; then
    systemctl --user enable --now claudex 2>/dev/null || systemctl --user restart claudex || true
    ok "claudex (bridge) service started"
else
    warn "claudex.service not found — start the bridge with: bash $WORKSPACE/scripts/start-claudex.sh"
fi

# ── Step 10: health check ────────────────────────────────────────────────────
step "Health check"
HEALTH_URL="http://127.0.0.1:${MATRIX_SIDECAR_PORT}/health"
H=""
for _ in $(seq 1 30); do
    H="$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null || true)"
    printf '%s' "$H" | grep -q '"synced":true' && break
    sleep 2
done
say "  $HEALTH_URL → ${H:-<no response>}"
if printf '%s' "$H" | grep -q '"crossSigningReady":true'; then
    say ""
    say "╔══════════════════════════════════════════════╗"
    say "║   ✅ Matrix channel is LIVE                   ║"
    say "╚══════════════════════════════════════════════╝"
    say "Send a message from your verified Element device ($HUMAN_USER) and the bot replies."
    say "Manage:  systemctl --user status matrix-sidecar claudex"
    say "Logs:    journalctl --user -u matrix-sidecar -f"
else
    say ""
    warn "sidecar is not fully ready yet (crossSigningReady not true)."
    say "  Check:  journalctl --user -u matrix-sidecar -n 50"
    say "  Then:   curl -s $HEALTH_URL"
    say "  Troubleshooting: docs/matrix-setup.md"
    exit 1
fi
