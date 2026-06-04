"""Integration tests for the Matrix bridge: a real in-process mock sidecar
(HTTP + SSE) plus a fake `claude` binary, driving the full
receive → authorize → claude → send loop over actual HTTP and child spawns.
Run: python3 -m unittest discover -s tests -t .
"""
import importlib.util
import json
import os
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "helpers"))

from mock_sidecar import start_mock_sidecar  # noqa: E402

MOCK_CLAUDE = os.path.join(HERE, "helpers", "mock_claude.py")
os.chmod(MOCK_CLAUDE, 0o755)

SENDER = "@you:s"
ROOM = "!room:s"
BOT = "@bot:s"


def load_bridge():
    spec = importlib.util.spec_from_file_location("matrix_bridge", os.path.join(ROOT, "scripts", "matrix-bridge.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


mb = load_bridge()


def wait_for(pred, timeout=6.0, interval=0.02):
    start = time.time()
    while time.time() - start < timeout:
        try:
            if pred():
                return True
        except Exception:
            pass
        time.sleep(interval)
    raise AssertionError("wait_for timed out")


def event(body="hello", sender=SENDER, room=ROOM, event_id=None, verified=True, ts=None):
    return {
        "type": "message", "room_id": room,
        "event_id": event_id or ("$" + str(ts or int(time.time() * 1000))),
        "sender": sender, "sender_verified": verified, "body": body, "ts": ts or 1,
    }


class IntegrationBase(unittest.TestCase):
    def setUp(self):
        self.server = start_mock_sidecar()
        self.workspace = tempfile.mkdtemp(prefix="cx-mx-")
        self.access_file = os.path.join(self.workspace, "access.json")
        self.inbox_dir = os.path.join(self.workspace, "inbox")
        self.log_file = os.path.join(self.workspace, "claude-invocations.log")
        os.environ["MOCK_CLAUDE_LOG"] = self.log_file

    def tearDown(self):
        try:
            self.bridge.stop()
        except Exception:
            pass
        self.server.close()
        os.environ.pop("MOCK_CLAUDE_LOG", None)

    def start_bridge(self, access, **overrides):
        with open(self.access_file, "w") as fh:
            json.dump(access, fh)
        config = {
            "sidecar_url": self.server.url, "sidecar_token": self.server.token,
            "bot_user_id": BOT, "workspace": self.workspace, "model": "claude-test",
            "claude_bin": MOCK_CLAUDE, "claude_timeout": 8.0,
            "access_file": self.access_file, "inbox_dir": self.inbox_dir,
            "max_msg_len": 4000, "require_verified": True,
            "backoff_base": 0.05, "backoff_cap": 0.2,
        }
        config.update(overrides)
        self.bridge = mb.Bridge(config)
        threading.Thread(target=self.bridge.run_forever, daemon=True).start()
        wait_for(lambda: self.server.stream_count() >= 1)  # SSE subscribed
        return config

    def invocations(self):
        if not os.path.exists(self.log_file):
            return []
        with open(self.log_file) as fh:
            return [json.loads(ln) for ln in fh if ln.strip()]

    def inbox_count(self):
        return len(os.listdir(self.inbox_dir)) if os.path.isdir(self.inbox_dir) else 0


class Tests(IntegrationBase):
    def test_authorized_verified_dm_round_trip(self):
        cfg = self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("hello", ts=1001))
        wait_for(lambda: len(self.server.send_calls) == 1)
        sent = self.server.send_calls[0]
        self.assertEqual(sent["room_id"], ROOM)
        self.assertEqual(sent["body"], "echo:hello")
        wait_for(lambda: self.inbox_count() == 0)  # delivered → backlog cleared

    def test_unverified_sender_dropped(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("hi", verified=False, ts=1002))
        time.sleep(0.3)
        self.assertEqual(len(self.server.send_calls), 0)
        self.assertEqual(self.inbox_count(), 0)
        self.assertEqual(len(self.invocations()), 0)

    def test_unauthorized_sender_dropped(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": ["@someone-else:s"]})
        self.server.push(event("hi", ts=1003))
        time.sleep(0.3)
        self.assertEqual(len(self.server.send_calls), 0)
        self.assertEqual(len(self.invocations()), 0)

    def test_per_room_session_continuity(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("first", event_id="$a", ts=2001))
        wait_for(lambda: len(self.server.send_calls) == 1)
        self.server.push(event("second", event_id="$b", ts=2002))
        wait_for(lambda: len(self.server.send_calls) == 2)
        calls = self.invocations()
        self.assertEqual(len(calls), 2)
        self.assertNotIn("--resume", calls[0])             # first turn does not resume
        self.assertIn("--resume", calls[1])                # second turn resumes
        self.assertEqual(calls[1][calls[1].index("--resume") + 1], "sess-A")

    def test_long_reply_split(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]}, max_msg_len=20)
        self.server.push(event("make it LONG please", ts=3001))
        wait_for(lambda: len(self.server.send_calls) == 3)
        self.assertEqual([c["body"] for c in self.server.send_calls], ["x" * 20, "x" * 20, "x" * 10])

    def test_empty_reply_sends_nothing_clears_backlog(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("give me EMPTY", ts=3501))
        wait_for(lambda: self.inbox_count() == 0 and os.path.exists(self.log_file))
        time.sleep(0.15)
        self.assertEqual(len(self.server.send_calls), 0)

    def test_claude_failure_leaves_backlog(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("please FAIL now", ts=4001))
        wait_for(lambda: self.inbox_count() == 1)
        self.assertEqual(len(self.server.send_calls), 0)

    def test_duplicate_event_processed_once(self):
        self.start_bridge({"policy": "allowlist", "allowFrom": [SENDER]})
        self.server.push(event("dup", event_id="$dup", ts=5001))
        self.server.push(event("dup", event_id="$dup", ts=5001))  # identical → de-duped
        wait_for(lambda: len(self.server.send_calls) == 1)
        time.sleep(0.2)
        self.assertEqual(len(self.server.send_calls), 1)

    def test_open_policy_allows_unlisted_verified(self):
        self.start_bridge({"policy": "open", "allowFrom": []})
        self.server.push(event("hi", sender="@anyone:s", ts=6001))
        wait_for(lambda: len(self.server.send_calls) == 1)
        self.assertEqual(self.server.send_calls[0]["body"], "echo:hi")


if __name__ == "__main__":
    unittest.main()
