#!/usr/bin/env python3
"""A fake `claude` for the Matrix bridge tests.

Mimics `claude -p <body> --output-format json [--resume <id>] ...`:
  • appends its full argv (JSON) to $MOCK_CLAUDE_LOG, one line per call
  • prints a JSON result object on stdout

Body conventions:
  contains "FAIL"  → exit 1 with stderr (error path)
  contains "EMPTY" → empty result (no reply to send)
  contains "LONG"  → a 50-char result (to exercise message splitting)
  otherwise        → result = "echo:<body>"

Session id: echoes back --resume <id> when given, else a fixed "sess-A".
"""
import json
import os
import sys

argv = sys.argv[1:]


def val(flag):
    if flag in argv:
        i = argv.index(flag)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


body = val("-p") or ""
resume = val("--resume")

logf = os.environ.get("MOCK_CLAUDE_LOG")
if logf:
    try:
        with open(logf, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(argv) + "\n")
    except Exception:
        pass

if "FAIL" in body:
    sys.stderr.write("mock claude: simulated failure\n")
    sys.exit(1)

if "EMPTY" in body:
    result = ""
elif "LONG" in body:
    result = "x" * 50
else:
    result = "echo:" + body

print(json.dumps({
    "type": "result", "subtype": "success", "result": result,
    "session_id": resume or "sess-A", "total_cost_usd": 0.001, "is_error": False,
}))
sys.exit(0)
