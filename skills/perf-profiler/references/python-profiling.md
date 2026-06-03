# Python Profiling Guide

## Quick Methods

### 1. time module

```python
import time
start = time.perf_counter()
# ... code ...
print(f"Elapsed: {time.perf_counter() - start:.4f}s")
```

### 2. cProfile

```bash
python -m cProfile -s cumulative script.py
```

### 3. memory_profiler

```bash
pip install memory_profiler
python -m memory_profiler script.py
```

### 4. tracemalloc

```python
import tracemalloc
tracemalloc.start()
# ... code ...
snapshot = tracemalloc.take_snapshot()
for stat in snapshot.statistics('lineno')[:10]:
    print(stat)
```

## Common Bottlenecks

| Symptom        | Likely Cause                | Fix                                             |
| -------------- | --------------------------- | ----------------------------------------------- |
| Slow loops     | Pure Python iteration       | Use list comprehensions, numpy, or C extensions |
| High memory    | Large lists/dicts in memory | Use generators, itertools                       |
| Slow I/O       | Synchronous I/O             | Use asyncio, threading for I/O-bound            |
| Import time    | Heavy top-level imports     | Lazy imports                                    |
| GIL contention | CPU-bound threads           | Use multiprocessing                             |

## Tools

- **py-spy**: Sampling profiler (`py-spy top -- python app.py`)
- **scalene**: CPU+memory+GPU profiler
- **line_profiler**: Line-by-line profiling
