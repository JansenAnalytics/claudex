#!/usr/bin/env python3
"""matrix-bridge.py — Matrix channel bridge for Claudex.

Connects the local `matrix-sidecar` (a Rust matrix-rust-sdk daemon that owns ALL
cryptography, persistence, and verified-only delivery) to Claude Code (headless).
It is the Matrix counterpart of the Telegram channel and plays the same role:
receive inbound messages, gate them through access control, hand each to Claude,
and relay Claude's reply back.

  Inbound:  SSE   GET  {SIDECAR}/events            (decrypted, content-bearing events)
  Outbound: JSON  POST {SIDECAR}/send              ({room_id, body})
  Health:   GET   {SIDECAR}/health                 (no secrets)
  Delivery: each authorized message → `claude -p <body> --resume <sid>` → reply

Security posture:
  • No shell — `claude` is spawned with the user's text as a single argv element.
  • Fail-closed access control, re-read on every message.
  • Acts only on messages from cross-signed/verified senders (the sidecar flags this).
  • ANTHROPIC_API_KEY removed from the child env (force OAuth / Max).
  • Identifiers redacted in logs; message bodies are never logged.
  • Session store and inbox files written 0600.

This module has NO third-party dependencies (Python standard library only).
Pure helpers at the top are importable for unit tests; network/process usage is
isolated in the classes below.

Environment (also read from {workspace}/.env):
  MATRIX_SIDECAR_URL     sidecar base URL              (default http://127.0.0.1:8765)
  MATRIX_SIDECAR_TOKEN   bearer token for the sidecar  (required)
  MATRIX_USER_ID         the bot's own @user:server    (required; used to ignore self)
  CLAUDEX_WORKSPACE      agent workspace               (default ~/.claude-agent)
  CLAUDEX_MODEL          model passed to claude        (default claude-opus-4-8)
  CLAUDE_BIN             claude executable             (default "claude")
  MATRIX_ACCESS_FILE     access policy JSON            (default ~/.claude/channels/matrix/access.json)
  MATRIX_INBOX_DIR       delivery-health inbox dir     (default ~/.claude/channels/matrix/inbox)
  MATRIX_MAX_MSG_LEN     split replies longer than this(default 4000)
  MATRIX_CLAUDE_TIMEOUT  per-message claude timeout, s (default 600)
  MATRIX_REQUIRE_VERIFIED "0" to act on unverified senders too (default on)
"""

import json
import os
import sys
import time
import threading
import queue
import hashlib
import subprocess
import socket
import urllib.request
import urllib.error
from pathlib import Path

# ── Pure helpers (imported by tests) ─────────────────────────────────────────


def normalize_access(obj):
    """Coerce arbitrary JSON into a safe access-policy dict.

    Missing/invalid → allowlist policy with nothing allowed (fail closed)."""
    o = obj if isinstance(obj, dict) else {}

    def arr(v):
        return [x for x in v if isinstance(x, str) and x] if isinstance(v, list) else []

    policy = "open" if o.get("policy") == "open" else "allowlist"
    return {
        "policy": policy,
        "allowFrom": arr(o.get("allowFrom")),
        "roomAllowFrom": arr(o.get("roomAllowFrom")),
    }


def load_access(path):
    """Load and normalise the access file. Missing/invalid → safe default."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return normalize_access(json.load(fh))
    except Exception:
        return normalize_access(None)


def is_authorized(access, msg, bot_user_id=None, require_verified=True):
    """Decide whether a parsed message may reach Claude.

    Self-messages are ignored (loop prevention). With require_verified, messages
    from devices the sidecar did not flag as verified/cross-signed are dropped —
    the control that makes a managed homeserver safe. Then: open policy allows
    anyone; otherwise the sender must be on allowFrom (or '*'), or the room must
    be on roomAllowFrom (or '*')."""
    a = normalize_access(access)
    sender = msg.get("sender")
    room = msg.get("room_id")

    if bot_user_id and sender == bot_user_id:
        return {"allowed": False, "reason": "self-message ignored"}
    if require_verified and not msg.get("sender_verified", False):
        return {"allowed": False, "reason": "sender device not verified"}
    if a["policy"] == "open":
        return {"allowed": True, "reason": "open policy"}
    if sender and ("*" in a["allowFrom"] or sender in a["allowFrom"]):
        return {"allowed": True, "reason": "sender allowlisted"}
    if room and ("*" in a["roomAllowFrom"] or room in a["roomAllowFrom"]):
        return {"allowed": True, "reason": "room allowlisted"}
    return {"allowed": False, "reason": "sender not in allowlist"}


def parse_event(raw):
    """Normalise a sidecar SSE payload into a flat message, or None if not
    actionable. The sidecar already filters receipts/typing/own-messages and
    emits only decrypted, content-bearing events, but we stay defensive."""
    if not isinstance(raw, dict):
        return None
    if raw.get("type") != "message":
        return None
    body = raw.get("body")
    if not isinstance(body, str) or not body:
        return None
    room_id = raw.get("room_id")
    event_id = raw.get("event_id")
    if not room_id or not event_id:
        return None
    return {
        "room_id": room_id,
        "event_id": event_id,
        "sender": raw.get("sender"),
        "sender_verified": bool(raw.get("sender_verified", False)),
        "body": body,
        "ts": raw.get("ts") or 0,
    }


def seen_key(msg):
    """Stable de-dupe key for an inbound message (guards SSE redelivery)."""
    return str(msg.get("event_id") or "?")


def build_claude_args(body, session_id=None, model=None, extra_args=None):
    """Build argv for a headless claude invocation. User text is a single argv
    element (spawned without a shell) so it can never be shell-interpreted."""
    args = ["-p", str(body), "--output-format", "json", "--dangerously-skip-permissions"]
    if model:
        args += ["--model", str(model)]
    if session_id:
        args += ["--resume", str(session_id)]
    if extra_args:
        args += list(extra_args)
    return args


def extract_claude_reply(stdout):
    """Extract assistant text + resumable session id from `claude -p
    --output-format json` stdout. Falls back to raw text if not the expected JSON."""
    text0 = (stdout or "").strip()

    def try_parse(s):
        try:
            o = json.loads(s)
            return o if isinstance(o, dict) else None
        except Exception:
            return None

    obj = try_parse(text0)
    if obj is None:
        for line in reversed([ln.strip() for ln in text0.split("\n") if ln.strip()]):
            obj = try_parse(line)
            if obj is not None:
                break
    if obj is not None:
        is_error = obj.get("is_error") is True or obj.get("subtype") == "error" or obj.get("type") == "error"
        text = obj.get("result") if isinstance(obj.get("result"), str) else (
            obj.get("text") if isinstance(obj.get("text"), str) else "")
        session_id = obj.get("session_id") or obj.get("sessionId")
        return {"text": (text or "").strip(), "session_id": session_id, "is_error": is_error}
    return {"text": text0, "session_id": None, "is_error": False}


def format_for_matrix(text):
    """Light whitespace tidy. Matrix renders the plain body; the model is told in
    rules/matrix.md to use Matrix-friendly formatting."""
    s = "" if text is None else str(text)
    s = s.replace("\r\n", "\n")
    lines = [ln.rstrip(" \t") for ln in s.split("\n")]
    out = "\n".join(lines)
    while "\n\n\n" in out:
        out = out.replace("\n\n\n", "\n\n")
    return out.strip()


def split_message(text, max_len=4000):
    """Split a long reply into Matrix-sized chunks on line/word boundaries."""
    s = "" if text is None else str(text)
    if len(s) <= max_len:
        return [s] if s else []
    out = []
    buf = ""

    def flush():
        nonlocal buf
        if buf:
            out.append(buf)
            buf = ""

    for piece in s.split("\n"):
        if len(piece) > max_len:
            flush()
            for i in range(0, len(piece), max_len):
                out.append(piece[i:i + max_len])
            continue
        if len(buf) + len(piece) + 1 > max_len:
            flush()
        buf = (buf + "\n" + piece) if buf else piece
    flush()
    return out


def backoff_delay(attempt, base=2.0, cap=60.0):
    """Exponential backoff (seconds), capped. Deterministic (no jitter) for tests."""
    return min(cap, base * (2 ** max(0, attempt)))


def redact_id(s):
    """Redact a Matrix id / event id for logs — never log full identifiers."""
    if not s:
        return "?"
    s = str(s)
    if s.startswith("@") and ":" in s:
        local, _, domain = s[1:].partition(":")
        return "@" + (local[:1] if local else "") + "***:" + domain
    if s.startswith("!") or s.startswith("$"):
        return s[:4] + "…"
    return s[:3] + "…" if len(s) > 6 else s


def parse_env_file(content):
    """Parse a dotenv-style file into a dict (KEY=VALUE, # comments, quotes)."""
    out = {}
    for raw in str(content or "").split("\n"):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        if key:
            out[key] = val
    return out


def build_config(env):
    """Build the bridge config from an environment mapping."""
    home = os.path.expanduser("~")
    workspace = env.get("CLAUDEX_WORKSPACE") or os.path.join(home, ".claude-agent")
    port = env.get("MATRIX_SIDECAR_PORT") or "8765"
    return {
        "sidecar_url": (env.get("MATRIX_SIDECAR_URL") or f"http://127.0.0.1:{port}").rstrip("/"),
        "sidecar_token": env.get("MATRIX_SIDECAR_TOKEN") or "",
        "bot_user_id": env.get("MATRIX_USER_ID") or "",
        "workspace": workspace,
        "model": env.get("CLAUDEX_MODEL") or "claude-opus-4-8",
        "claude_bin": env.get("CLAUDE_BIN") or "claude",
        "access_file": env.get("MATRIX_ACCESS_FILE") or os.path.join(home, ".claude", "channels", "matrix", "access.json"),
        "inbox_dir": env.get("MATRIX_INBOX_DIR") or os.path.join(home, ".claude", "channels", "matrix", "inbox"),
        "max_msg_len": int(env.get("MATRIX_MAX_MSG_LEN") or 4000),
        "claude_timeout": float(env.get("MATRIX_CLAUDE_TIMEOUT") or 600),
        "require_verified": env.get("MATRIX_REQUIRE_VERIFIED", "1") != "0",
        "backoff_base": float(env.get("MATRIX_RECONNECT_BASE") or 2.0),
        "backoff_cap": float(env.get("MATRIX_RECONNECT_CAP") or 60.0),
        "socket_timeout": float(env.get("MATRIX_SSE_TIMEOUT") or 75.0),
    }


def load_workspace_env(workspace):
    """Load {workspace}/.env into os.environ without overriding existing vars."""
    try:
        with open(os.path.join(workspace, ".env"), "r", encoding="utf-8") as fh:
            for k, v in parse_env_file(fh.read()).items():
                os.environ.setdefault(k, v)
    except OSError:
        pass


# ── Structured, redacted logging ─────────────────────────────────────────────


def log(level, event, **meta):
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "level": level, "event": event}
    rec.update(meta)
    stream = sys.stderr if level in ("error", "warn") else sys.stdout
    stream.write(json.dumps(rec) + "\n")
    stream.flush()


# ── Sidecar HTTP client ──────────────────────────────────────────────────────


class SidecarClient:
    """Minimal HTTP client for the matrix-sidecar (stdlib urllib only)."""

    def __init__(self, base_url, token, socket_timeout=75.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.socket_timeout = socket_timeout
        self._resp = None  # current SSE response, so the reader can be interrupted

    def _auth_headers(self, extra=None):
        h = {"Authorization": f"Bearer {self.token}"}
        if extra:
            h.update(extra)
        return h

    def health(self, timeout=8):
        try:
            req = urllib.request.Request(f"{self.base_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return 200 <= r.status < 300
        except Exception:
            return False

    def send(self, room_id, body, formatted_body=None, timeout=30):
        payload = json.dumps({"room_id": room_id, "body": body, "formatted_body": formatted_body}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/send", data=payload, method="POST",
            headers=self._auth_headers({"Content-Type": "application/json"}),
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def open_events(self, running=lambda: True):
        """Open the SSE stream and yield decoded JSON payload strings.

        Uses a socket read timeout so the reader can re-check `running()` during
        idle gaps and exit cleanly when the bridge stops, and so a stalled link
        is noticed. The buffered response is only ever closed from THIS (reader)
        thread — `abort()` interrupts a blocked read by shutting down the socket,
        never by closing the file cross-thread (which would deadlock)."""
        req = urllib.request.Request(
            f"{self.base_url}/events", method="GET",
            headers=self._auth_headers({"Accept": "text/event-stream"}),
        )
        self._resp = urllib.request.urlopen(req, timeout=self.socket_timeout)
        try:
            while running():
                try:
                    raw = self._resp.readline()
                except (TimeoutError, OSError):
                    if not running():
                        break
                    continue  # idle keepalive gap, or interrupted — re-check & retry
                if not raw:
                    break  # EOF / stream closed
                line = raw.decode("utf-8", "replace").rstrip("\n").rstrip("\r")
                if not line or line.startswith(":"):  # keepalive comment / blank
                    continue
                if line.startswith("data:"):
                    payload = line[5:].strip()
                    if payload:
                        yield payload
        finally:
            try:
                self._resp.close()
            except Exception:
                pass
            self._resp = None

    def abort(self):
        """Interrupt a blocked read from another thread by shutting down the
        socket (does NOT take the buffered-reader lock, so no deadlock with the
        reader). Falls back to the read timeout if internals are unavailable."""
        resp = self._resp
        if resp is None:
            return
        try:
            resp.fp.raw._sock.shutdown(socket.SHUT_RDWR)  # CPython internal; guarded
        except Exception:
            pass


# ── Claude headless runner ───────────────────────────────────────────────────


class ClaudeRunner:
    def __init__(self, bin="claude", workspace=None, model=None, timeout=600.0):
        self.bin = bin or "claude"
        self.workspace = workspace
        self.model = model
        self.timeout = timeout

    def run(self, body, session_id=None):
        args = build_claude_args(body, session_id=session_id, model=self.model)
        env = dict(os.environ)
        env.pop("ANTHROPIC_API_KEY", None)  # force OAuth / Max, mirroring start-claudex.sh
        # Each message is a fresh `claude -p` session; without this flag its
        # SessionStart/Stop hooks would re-run the heavy workspace lifecycle (memory
        # reindex, log rotation, watchdog stamping, inbox) on EVERY message. The
        # agent's CLAUDE.md / skills / memory still load; only those hooks skip.
        env["CLAUDEX_SKIP_LIFECYCLE_HOOKS"] = "1"
        try:
            proc = subprocess.run(
                [self.bin] + args, cwd=self.workspace, env=env,
                capture_output=True, text=True, timeout=self.timeout,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"claude timed out after {self.timeout}s")
        reply = extract_claude_reply(proc.stdout)
        if proc.returncode != 0 and not reply["text"]:
            raise RuntimeError(f"claude exited {proc.returncode}: {(proc.stderr or '')[:200] or 'no output'}")
        return reply


# ── Per-room Claude session store (survives restarts) ────────────────────────


class SessionStore:
    def __init__(self, file_path):
        self.file_path = file_path
        self.lock = threading.Lock()
        try:
            with open(file_path, "r", encoding="utf-8") as fh:
                self.map = json.load(fh) or {}
        except Exception:
            self.map = {}

    def get(self, room_id):
        return self.map.get(room_id)

    def set(self, room_id, session_id):
        if not session_id or self.map.get(room_id) == session_id:
            return
        with self.lock:
            self.map[room_id] = session_id
            try:
                Path(self.file_path).parent.mkdir(parents=True, exist_ok=True)
                fd = os.open(self.file_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    json.dump(self.map, fh, indent=2)
            except Exception:
                pass  # best effort — continuity is a nicety, not a guarantee


# ── Bridge orchestration ─────────────────────────────────────────────────────


class Bridge:
    """Receive → authorize → claude → send, with per-room ordering and
    concurrency across rooms. Runs `claude` per message via a worker thread per
    room so different conversations proceed in parallel while each stays ordered
    (correct `--resume` continuity)."""

    def __init__(self, config, client=None, runner=None):
        self.config = config
        self.client = client or SidecarClient(
            config["sidecar_url"], config["sidecar_token"],
            socket_timeout=config.get("socket_timeout", 75.0),
        )
        self.runner = runner or ClaudeRunner(
            bin=config["claude_bin"], workspace=config["workspace"],
            model=config["model"], timeout=config["claude_timeout"],
        )
        self.sessions = SessionStore(os.path.join(config["workspace"], "data", "matrix-sessions.json"))
        self.seen = set()
        self.seen_order = []
        self.running = False
        self.workers = {}  # room_id → (Queue, Thread)
        self.workers_lock = threading.Lock()
        self._reader = None

    # -- inbound --

    def on_payload(self, payload):
        try:
            raw = json.loads(payload)
        except Exception as e:
            log("warn", "sse_parse_error", err=str(e))
            return
        msg = parse_event(raw)
        if not msg:
            return

        key = seen_key(msg)
        if key in self.seen:
            return
        self.seen.add(key)
        self.seen_order.append(key)
        if len(self.seen_order) > 1000:  # bound memory
            for old in self.seen_order[:500]:
                self.seen.discard(old)
            self.seen_order = self.seen_order[500:]

        access = load_access(self.config["access_file"])  # re-read so live edits take effect
        verdict = is_authorized(
            access, msg, bot_user_id=self.config["bot_user_id"],
            require_verified=self.config["require_verified"],
        )
        if not verdict["allowed"]:
            log("info", "msg_denied", sender=redact_id(msg.get("sender")),
                room=redact_id(msg.get("room_id")), reason=verdict["reason"])
            return

        log("info", "msg_accepted", sender=redact_id(msg.get("sender")),
            room=redact_id(msg.get("room_id")), chars=len(msg["body"]))
        self.dispatch(msg)

    def dispatch(self, msg):
        room_id = msg["room_id"]
        with self.workers_lock:
            entry = self.workers.get(room_id)
            if entry is None:
                q = queue.Queue()
                t = threading.Thread(target=self._worker, args=(room_id, q), daemon=True)
                self.workers[room_id] = (q, t)
                t.start()
            else:
                q = entry[0]
        q.put(msg)

    def _worker(self, room_id, q):
        while self.running:
            try:
                msg = q.get(timeout=1.0)
            except queue.Empty:
                continue
            if msg is None:
                break
            try:
                self.process_message(msg)
            except Exception as e:  # never let a worker die silently
                log("error", "worker_error", room=redact_id(room_id), err=str(e))

    # -- processing --

    def process_message(self, msg):
        room_id = msg["room_id"]
        inbox_file = os.path.join(
            self.config["inbox_dir"],
            f"{int(msg.get('ts') or time.time())}-{seen_key(msg)[:12].lstrip('$')}.json",
        )
        try:
            Path(self.config["inbox_dir"]).mkdir(parents=True, exist_ok=True)
            fd = os.open(inbox_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                           "sender": redact_id(msg.get("sender")),
                           "room": redact_id(room_id), "chars": len(msg["body"])}, fh)
        except Exception as e:
            log("warn", "inbox_write_failed", err=str(e))

        try:
            reply = self.runner.run(msg["body"], self.sessions.get(room_id))
            if reply.get("session_id"):
                self.sessions.set(room_id, reply["session_id"])
            if reply.get("is_error"):
                log("warn", "claude_reported_error", room=redact_id(room_id))

            text = format_for_matrix(reply.get("text"))
            if not text:
                log("warn", "empty_reply", room=redact_id(room_id))
                self._remove_inbox(inbox_file)
                return
            parts = split_message(text, self.config["max_msg_len"])
            for part in parts:
                self.client.send(room_id, part)
            log("info", "reply_sent", room=redact_id(room_id), parts=len(parts), chars=len(text))
            self._remove_inbox(inbox_file)  # delivered → clears watchdog backlog
        except Exception as e:
            # Leave the inbox file in place: a persistent backlog is what the
            # watchdog uses to detect a wedged channel.
            log("error", "process_failed", room=redact_id(room_id), err=str(e))

    def _remove_inbox(self, path):
        try:
            os.unlink(path)
        except OSError:
            pass

    # -- lifecycle --

    def boot_init(self):
        Path(os.path.join(self.config["workspace"], "data")).mkdir(parents=True, exist_ok=True)
        Path(self.config["inbox_dir"]).mkdir(parents=True, exist_ok=True)
        # Seed watchdog files so the channel-agnostic watchdog treats Matrix like the others.
        try:
            with open(os.path.join(self.config["workspace"], "data", "watchdog_session_start"), "w") as fh:
                fh.write(str(int(time.time())))
        except Exception:
            pass

    def run_forever(self):
        self.running = True
        self.boot_init()
        log("info", "bridge_start", sidecar=self.config["sidecar_url"],
            bot=redact_id(self.config["bot_user_id"]), workspace=self.config["workspace"],
            model=self.config["model"], require_verified=self.config["require_verified"])
        attempt = 0
        while self.running:
            try:
                log("info", "sse_connect", url=self.config["sidecar_url"] + "/events")
                for payload in self.client.open_events(running=lambda: self.running):
                    attempt = 0  # a clean event means the link is healthy
                    self.on_payload(payload)
                reason = "stream ended"
            except Exception as e:
                reason = str(e)
            if not self.running:
                break
            delay = backoff_delay(attempt, self.config["backoff_base"], self.config["backoff_cap"])
            attempt += 1
            log("warn", "sse_reconnect", reason=reason, attempt=attempt, delay_s=delay)
            time.sleep(delay)

    def stop(self):
        self.running = False
        self.client.abort()


# ── main ─────────────────────────────────────────────────────────────────────


def main():
    pre_workspace = os.environ.get("CLAUDEX_WORKSPACE") or os.path.join(os.path.expanduser("~"), ".claude-agent")
    load_workspace_env(pre_workspace)

    config = build_config(os.environ)
    if not config["sidecar_token"]:
        sys.stderr.write("FATAL: MATRIX_SIDECAR_TOKEN is required (see docs/matrix-setup.md).\n")
        sys.exit(1)
    if not config["bot_user_id"]:
        sys.stderr.write("FATAL: MATRIX_USER_ID is required (the bot's own @user:server).\n")
        sys.exit(1)

    bridge = Bridge(config)

    import signal as _signal

    def _shutdown(*_a):
        bridge.stop()
        sys.exit(0)

    _signal.signal(_signal.SIGINT, _shutdown)
    _signal.signal(_signal.SIGTERM, _shutdown)
    bridge.run_forever()


if __name__ == "__main__":
    main()
