"""Unit tests for the pure helpers in scripts/matrix-bridge.py.
Run: python3 -m unittest discover -s tests -t .
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_bridge():
    spec = importlib.util.spec_from_file_location("matrix_bridge", os.path.join(ROOT, "scripts", "matrix-bridge.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


mb = load_bridge()


class NormalizeAccess(unittest.TestCase):
    def test_safe_defaults(self):
        self.assertEqual(mb.normalize_access(None), {"policy": "allowlist", "allowFrom": [], "roomAllowFrom": []})
        self.assertEqual(mb.normalize_access({}), {"policy": "allowlist", "allowFrom": [], "roomAllowFrom": []})

    def test_coerces_bad_types_and_policy(self):
        a = mb.normalize_access({"policy": "nonsense", "allowFrom": "x", "roomAllowFrom": [1, "!r:s", None]})
        self.assertEqual(a["policy"], "allowlist")        # unknown policy → safe default
        self.assertEqual(a["allowFrom"], [])              # string is not a list
        self.assertEqual(a["roomAllowFrom"], ["!r:s"])    # non-strings dropped

    def test_keeps_open(self):
        self.assertEqual(mb.normalize_access({"policy": "open"})["policy"], "open")


class LoadAccess(unittest.TestCase):
    def test_missing_file_fails_closed(self):
        self.assertEqual(mb.load_access(os.path.join(tempfile.gettempdir(), "nope-%d.json" % os.getpid())),
                         {"policy": "allowlist", "allowFrom": [], "roomAllowFrom": []})

    def test_valid_and_invalid(self):
        with tempfile.TemporaryDirectory() as d:
            good = os.path.join(d, "good.json")
            with open(good, "w") as fh:
                json.dump({"policy": "allowlist", "allowFrom": ["@you:s"]}, fh)
            self.assertEqual(mb.load_access(good)["allowFrom"], ["@you:s"])
            bad = os.path.join(d, "bad.json")
            with open(bad, "w") as fh:
                fh.write("{not json")
            self.assertEqual(mb.load_access(bad), {"policy": "allowlist", "allowFrom": [], "roomAllowFrom": []})


class IsAuthorized(unittest.TestCase):
    def msg(self, **over):
        m = {"sender": "@you:s", "room_id": "!r:s", "sender_verified": True}
        m.update(over)
        return m

    def test_self_message_denied(self):
        v = mb.is_authorized({"policy": "open"}, self.msg(sender="@bot:s"), bot_user_id="@bot:s")
        self.assertFalse(v["allowed"])

    def test_unverified_denied_by_default(self):
        acc = {"policy": "allowlist", "allowFrom": ["@you:s"]}
        self.assertFalse(mb.is_authorized(acc, self.msg(sender_verified=False))["allowed"])
        # but allowed if verification not required
        self.assertTrue(mb.is_authorized(acc, self.msg(sender_verified=False), require_verified=False)["allowed"])

    def test_allowlist(self):
        acc = {"policy": "allowlist", "allowFrom": ["@you:s"]}
        self.assertTrue(mb.is_authorized(acc, self.msg())["allowed"])
        self.assertFalse(mb.is_authorized(acc, self.msg(sender="@stranger:s"))["allowed"])

    def test_wildcard_and_room(self):
        self.assertTrue(mb.is_authorized({"allowFrom": ["*"]}, self.msg(sender="@anyone:s"))["allowed"])
        self.assertTrue(mb.is_authorized({"roomAllowFrom": ["!r:s"]}, self.msg(sender="@x:s"))["allowed"])

    def test_open_policy(self):
        self.assertTrue(mb.is_authorized({"policy": "open"}, self.msg(sender="@anyone:s"))["allowed"])


class ParseEvent(unittest.TestCase):
    def test_valid(self):
        m = mb.parse_event({"type": "message", "room_id": "!r:s", "event_id": "$e", "sender": "@u:s",
                            "sender_verified": True, "body": "hi", "ts": 5})
        self.assertEqual(m["body"], "hi")
        self.assertEqual(m["room_id"], "!r:s")
        self.assertTrue(m["sender_verified"])

    def test_sidecar_contract_payload(self):
        # EXACT shape emitted by matrix-sidecar's InboundMsg (mirrored by the Rust
        # `inbound_msg_contract_matches_bridge` test). If either side drifts, one fails.
        raw = json.loads(
            '{"type":"message","room_id":"!r:s","event_id":"$e","sender":"@u:s",'
            '"sender_verified":true,"body":"hi","ts":5}'
        )
        m = mb.parse_event(raw)
        assert m is not None
        assert m["room_id"] == "!r:s"
        assert m["event_id"] == "$e"
        assert m["sender"] == "@u:s"
        assert m["sender_verified"] is True
        assert m["body"] == "hi"
        assert mb.seen_key(m) == "$e"

    def test_rejects_non_message_and_empty(self):
        self.assertIsNone(mb.parse_event({"type": "receipt"}))
        self.assertIsNone(mb.parse_event({"type": "message", "room_id": "!r:s", "event_id": "$e", "body": ""}))
        self.assertIsNone(mb.parse_event({"type": "message", "body": "hi"}))  # missing ids
        self.assertIsNone(mb.parse_event(None))
        self.assertIsNone(mb.parse_event(42))


class BuildClaudeArgs(unittest.TestCase):
    def test_injection_safe_single_argv(self):
        args = mb.build_claude_args("rm -rf / ; echo pwn", model="claude-opus-4-8")
        self.assertEqual(args[0], "-p")
        self.assertEqual(args[1], "rm -rf / ; echo pwn")  # single element — never shell-interpreted
        self.assertIn("--output-format", args)
        self.assertIn("json", args)
        self.assertIn("--dangerously-skip-permissions", args)
        i = args.index("--model")
        self.assertEqual(args[i:i + 2], ["--model", "claude-opus-4-8"])
        self.assertNotIn("--resume", args)

    def test_resume(self):
        args = mb.build_claude_args("hi", session_id="sess-9")
        i = args.index("--resume")
        self.assertEqual(args[i:i + 2], ["--resume", "sess-9"])


class ExtractClaudeReply(unittest.TestCase):
    def test_json(self):
        r = mb.extract_claude_reply(json.dumps({"result": "the answer", "session_id": "s1"}))
        self.assertEqual(r["text"], "the answer")
        self.assertEqual(r["session_id"], "s1")
        self.assertFalse(r["is_error"])

    def test_error_variants(self):
        self.assertTrue(mb.extract_claude_reply(json.dumps({"result": "x", "is_error": True}))["is_error"])
        self.assertTrue(mb.extract_claude_reply(json.dumps({"subtype": "error", "result": "x"}))["is_error"])

    def test_noisy_then_json(self):
        r = mb.extract_claude_reply('warning: blah\n{"result":"clean","session_id":"s2"}\n')
        self.assertEqual(r["text"], "clean")
        self.assertEqual(r["session_id"], "s2")

    def test_plain_and_empty(self):
        self.assertEqual(mb.extract_claude_reply("just text\n")["text"], "just text")
        self.assertEqual(mb.extract_claude_reply("")["text"], "")


class FormatAndSplit(unittest.TestCase):
    def test_format(self):
        self.assertEqual(mb.format_for_matrix("a  \r\nb\n\n\n\nc\n\n"), "a\nb\n\nc")
        self.assertEqual(mb.format_for_matrix(None), "")

    def test_split(self):
        self.assertEqual(mb.split_message("hello", 2000), ["hello"])
        self.assertEqual(mb.split_message("", 2000), [])
        self.assertEqual(mb.split_message("x" * 50, 20), ["x" * 20, "x" * 20, "x" * 10])
        parts = mb.split_message("\n".join(["aaaa", "bbbb", "cccc"]), 9)
        self.assertTrue(all(len(p) <= 9 for p in parts))
        self.assertEqual("\n".join(parts), "aaaa\nbbbb\ncccc")


class RedactAndEnv(unittest.TestCase):
    def test_redact(self):
        self.assertEqual(mb.redact_id("@alice:matrix.org"), "@a***:matrix.org")
        self.assertEqual(mb.redact_id("!room123:matrix.org"), "!roo…")
        self.assertEqual(mb.redact_id("$eventid"), "$eve…")
        self.assertEqual(mb.redact_id(""), "?")

    def test_parse_env(self):
        env = mb.parse_env_file("\n".join([
            "# comment", "MATRIX_USER_ID=@bot:s", 'MATRIX_SIDECAR_URL="http://127.0.0.1:8765"',
            "QUOTED='x'", "", "NOEQ", "EMPTY=",
        ]))
        self.assertEqual(env["MATRIX_USER_ID"], "@bot:s")
        self.assertEqual(env["MATRIX_SIDECAR_URL"], "http://127.0.0.1:8765")
        self.assertEqual(env["QUOTED"], "x")
        self.assertEqual(env["EMPTY"], "")
        self.assertNotIn("NOEQ", env)


class BuildConfig(unittest.TestCase):
    def test_defaults_and_overrides(self):
        d = mb.build_config({})
        self.assertEqual(d["sidecar_url"], "http://127.0.0.1:8765")
        self.assertEqual(d["model"], "claude-opus-4-8")
        self.assertEqual(d["max_msg_len"], 4000)
        self.assertTrue(d["require_verified"])
        o = mb.build_config({"MATRIX_SIDECAR_URL": "http://x:9/", "CLAUDEX_MODEL": "claude-sonnet-4-6",
                             "MATRIX_MAX_MSG_LEN": "500", "MATRIX_REQUIRE_VERIFIED": "0"})
        self.assertEqual(o["sidecar_url"], "http://x:9")  # trailing slash trimmed
        self.assertEqual(o["model"], "claude-sonnet-4-6")
        self.assertEqual(o["max_msg_len"], 500)
        self.assertFalse(o["require_verified"])


if __name__ == "__main__":
    unittest.main()
