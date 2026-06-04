"""A minimal in-process stand-in for the matrix-sidecar HTTP API, for the
integration tests. Implements just enough of the contract the bridge uses:

  GET  /health   → 200 {...}                         (no auth)
  GET  /events   → SSE stream the test can push into  (bearer auth)
  POST /send     → records the call, returns {event_id} (bearer auth)

Returned handle:
  url            base URL, e.g. http://127.0.0.1:54321
  token          the bearer token the bridge must present
  push(obj)      emit an inbound event to the open SSE stream
  send_calls     list of recorded /send payloads
  stream_count() number of currently-open SSE streams
  close()        shut the server down
"""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def start_mock_sidecar(token="testtoken"):
    state = {"frames": [], "send_calls": [], "lock": threading.Lock(), "stop": False, "streams": 0}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _authed(self):
            return self.headers.get("Authorization") == f"Bearer {token}"

        def do_GET(self):
            if self.path == "/health":
                payload = json.dumps({"ready": True, "synced": True, "crossSigningReady": True, "deviceId": "DEV"})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(payload.encode())
                return
            if self.path == "/events":
                if not self._authed():
                    self.send_response(401)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                with state["lock"]:
                    state["streams"] += 1
                try:
                    self.wfile.write(b":\n\n")  # initial keepalive comment
                    self.wfile.flush()
                    cursor = 0
                    while not state["stop"]:
                        with state["lock"]:
                            new = state["frames"][cursor:]
                            cursor = len(state["frames"])
                        for fr in new:
                            self.wfile.write(f"data: {fr}\n\n".encode())
                            self.wfile.flush()
                        time.sleep(0.02)
                except Exception:
                    pass
                finally:
                    with state["lock"]:
                        state["streams"] -= 1
                return
            self.send_response(404)
            self.end_headers()

        def do_POST(self):
            if self.path == "/send":
                if not self._authed():
                    self.send_response(401)
                    self.end_headers()
                    return
                n = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(n).decode("utf-8") if n else ""
                try:
                    data = json.loads(raw)
                except Exception:
                    data = {}
                with state["lock"]:
                    state["send_calls"].append(data)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"event_id": "$evt"}).encode())
                return
            self.send_response(404)
            self.end_headers()

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    class Handle:
        url = f"http://127.0.0.1:{port}"

        def __init__(self):
            self.token = token

        @property
        def send_calls(self):
            with state["lock"]:
                return list(state["send_calls"])

        def push(self, obj):
            with state["lock"]:
                state["frames"].append(json.dumps(obj))

        def stream_count(self):
            with state["lock"]:
                return state["streams"]

        def close(self):
            state["stop"] = True
            srv.shutdown()
            srv.server_close()

    return Handle()
