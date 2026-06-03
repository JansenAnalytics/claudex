# Node.js Profiling Guide

## Quick Methods

### 1. console.time

```js
console.time("operation");
// ... code ...
console.timeEnd("operation");
```

### 2. --prof (V8 profiler)

```bash
node --prof app.js
node --prof-process isolate-*.log > profile.txt
```

### 3. --inspect (Chrome DevTools)

```bash
node --inspect app.js
# Open chrome://inspect in Chrome
```

### 4. process.memoryUsage()

```js
const before = process.memoryUsage();
// ... code ...
const after = process.memoryUsage();
console.log("Heap delta:", (after.heapUsed - before.heapUsed) / 1024 / 1024, "MB");
```

## Common Bottlenecks

| Symptom               | Likely Cause                          | Fix                                          |
| --------------------- | ------------------------------------- | -------------------------------------------- |
| High CPU, single core | Sync operations in event loop         | Use async/worker threads                     |
| Growing memory        | Event listener leak, unclosed streams | Cleanup handlers, use weak refs              |
| Slow startup          | Large require() tree                  | Lazy-load modules                            |
| High latency spikes   | GC pauses                             | Reduce allocations, use --max-old-space-size |
| Slow I/O              | Missing connection pooling            | Pool DB/HTTP connections                     |

## Tools

- **clinic.js**: Auto-detect issues (`npx clinic doctor -- node app.js`)
- **0x**: Flame graphs (`npx 0x app.js`)
- **autocannon**: HTTP benchmarking (`npx autocannon http://localhost:3000`)
