---
name: mock-server
description: "Spin up mock API servers for frontend development and testing: static responses, record/replay real API calls, dynamic response generation."
---

# mock-server

Spin up mock API servers for frontend development and testing: static responses, record/replay real API calls, dynamic response generation.

## When to Use

- Developing frontend without a backend
- Testing against mock APIs
- Recording real API responses for replay
- Isolating frontend tests from backend dependencies

## Scripts

### mock-server.py

Python mock API server with zero dependencies.

```bash
python3 scripts/mock-server.py --config routes.json --port 8080
```

**Config format:**

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/users",
      "status": 200,
      "body": [{ "id": 1, "name": "Alice" }]
    },
    {
      "method": "POST",
      "path": "/api/users",
      "status": 201,
      "body": { "id": "{{random_id}}", "created": "{{timestamp}}" },
      "delay_ms": 100
    }
  ]
}
```

**Dynamic templates:** `{{random_id}}`, `{{timestamp}}`, `{{request.body.name}}`, `{{uuid}}`

Supports: regex path matching, custom headers, response delays.

### record-replay.py

Record real API calls and replay them.

```bash
# Record
python3 scripts/record-replay.py --mode record --target https://api.example.com --port 8081 --output recordings.json

# Replay
python3 scripts/record-replay.py --mode replay --input recordings.json --port 8081
```

### mock-config-gen.sh

Generate mock config from Express/Fastify routes or OpenAPI spec.

```bash
bash scripts/mock-config-gen.sh --source routes/ --output mock-routes.json
bash scripts/mock-config-gen.sh --source openapi.yaml --output mock-routes.json
```

## References

- `mocking-strategies.md` — When to mock vs use real APIs
