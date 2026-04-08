---
name: api-tester
description: "Systematic REST and GraphQL API endpoint testing: happy path, error cases, auth flows, rate limits, schema validation. Use when: testing backend APIs, validating endpoint responses, checking error ..."
---

# api-tester

Systematic REST and GraphQL API endpoint testing: happy path, error cases, auth flows, rate limits, schema validation. Use when: testing backend APIs, validating endpoint responses, checking error handling, verifying auth/permissions, or benchmarking API performance.

## Scripts

### api-test.py

Run API tests from a JSON test spec. Reports pass/fail with response details.

```bash
# From file
python3 scripts/api-test.py --spec tests.json

# From stdin
echo '{"base_url":"https://httpbin.org","tests":[{"name":"get","method":"GET","path":"/get","expect_status":200}]}' | python3 scripts/api-test.py
```

**Test spec format:**

```json
{
  "base_url": "http://localhost:3000",
  "default_headers": { "Authorization": "Bearer TOKEN" },
  "tests": [
    {
      "name": "list users",
      "method": "GET",
      "path": "/api/users",
      "expect_status": 200,
      "expect_json": { "type": "object" }
    },
    {
      "name": "create user",
      "method": "POST",
      "path": "/api/users",
      "headers": { "Content-Type": "application/json" },
      "body": { "name": "Test", "email": "t@t.com" },
      "expect_status": 201,
      "expect_json": { "required": ["id", "name"] }
    }
  ]
}
```

**expect_json validation:** `type` (array/object/string), `required` (list of keys that must exist), `properties` (nested type checks).

### api-spec-gen.sh

Generate a test spec skeleton from Express/Fastify route files.

```bash
bash scripts/api-spec-gen.sh --source ./routes --output api-tests.json
```

### api-benchmark.py

Performance benchmarking for API endpoints.

```bash
python3 scripts/api-benchmark.py --url https://httpbin.org/get --count 50 --concurrency 5
python3 scripts/api-benchmark.py --url http://localhost:3000/api/health --method GET --count 100 --concurrency 10 --headers '{"Authorization":"Bearer tok"}'
```

Reports: min, max, avg, median, p95, p99, throughput (req/s).

## References

- `references/rest-testing-patterns.md` — CRUD lifecycle, auth flows, pagination, error responses
- `references/api-checklist.md` — API quality checklist: status codes, error format, CORS, input validation
