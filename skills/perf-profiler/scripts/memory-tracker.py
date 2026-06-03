#!/usr/bin/env python3
"""Track memory usage of a Python script over time."""

import argparse
import subprocess
import sys
import time
import os
import resource


def get_memory_mb():
    """Get current process memory in MB."""
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    return usage.ru_maxrss / 1024  # Linux returns KB


def track_subprocess(script, interval=0.5, max_samples=100):
    """Track memory of a subprocess over time."""
    print(f"## Memory Tracker: {os.path.basename(script)}")
    print(f"**Interval:** {interval}s | **Max samples:** {max_samples}")
    print()

    proc = subprocess.Popen(
        [sys.executable, script],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    samples = []
    start = time.time()

    try:
        while proc.poll() is None and len(samples) < max_samples:
            try:
                # Read /proc/<pid>/status for VmRSS
                with open(f"/proc/{proc.pid}/status") as f:
                    for line in f:
                        if line.startswith("VmRSS:"):
                            rss_kb = int(line.split()[1])
                            elapsed = time.time() - start
                            samples.append((elapsed, rss_kb / 1024))
                            break
            except (FileNotFoundError, ProcessLookupError):
                break
            time.sleep(interval)
    except KeyboardInterrupt:
        proc.kill()

    proc.wait()
    duration = time.time() - start

    # Output results
    if samples:
        print("### Memory Over Time")
        print("| Time (s) | RSS (MB) |")
        print("|----------|----------|")
        for t, mb in samples:
            print(f"| {t:.1f} | {mb:.1f} |")

        peak = max(s[1] for s in samples)
        avg = sum(s[1] for s in samples) / len(samples)
        print()
        print(f"### Summary")
        print(f"- **Duration:** {duration:.2f}s")
        print(f"- **Samples:** {len(samples)}")
        print(f"- **Peak RSS:** {peak:.1f} MB")
        print(f"- **Avg RSS:** {avg:.1f} MB")
        print(f"- **Exit code:** {proc.returncode}")

        # Growth detection
        if len(samples) > 2:
            first_third = sum(s[1] for s in samples[: len(samples) // 3]) / (len(samples) // 3)
            last_third = sum(s[1] for s in samples[-len(samples) // 3 :]) / (len(samples) // 3)
            if last_third > first_third * 1.5:
                print()
                print("⚠️  **Possible memory leak detected!**")
                print(f"   Early avg: {first_third:.1f} MB → Late avg: {last_third:.1f} MB")
    else:
        print(f"Script completed too quickly for sampling (duration: {duration:.2f}s)")
        print(f"Exit code: {proc.returncode}")


def main():
    parser = argparse.ArgumentParser(description="Track Python script memory usage")
    parser.add_argument("--script", required=True, help="Python script to track")
    parser.add_argument("--interval", type=float, default=0.5, help="Sample interval in seconds")
    parser.add_argument("--max-samples", type=int, default=100, help="Max number of samples")
    args = parser.parse_args()

    if not os.path.isfile(args.script):
        print(f"File not found: {args.script}")
        sys.exit(1)

    track_subprocess(args.script, args.interval, args.max_samples)


if __name__ == "__main__":
    main()
