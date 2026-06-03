# Performance Anti-Patterns

## General

1. **Premature optimization** — Profile first, optimize second
2. **N+1 queries** — Fetch related data in batches, not loops
3. **Missing caching** — Cache expensive computations and I/O
4. **Sync in async** — Never block the event loop/async thread
5. **String concatenation in loops** — Use builders/join

## Node.js Specific

6. **Blocking the event loop** — No JSON.parse on large payloads synchronously
7. **Memory leaks via closures** — Watch for closures capturing large objects
8. **Unbounded arrays** — Cap array sizes, use streams for large data
9. **Missing connection pooling** — Reuse DB/HTTP connections
10. **Console.log in hot paths** — I/O is expensive in tight loops

## Python Specific

11. **Using list when generator works** — `range()` not `list(range())`
12. **Global interpreter lock** — Use multiprocessing for CPU-bound work
13. **Repeated attribute lookup** — Cache `obj.method` in local variable in tight loops
14. **Not using built-ins** — `sum()`, `max()`, `min()` are C-optimized
15. **Pandas apply()** — Use vectorized operations instead
