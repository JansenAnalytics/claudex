---
name: health-check
description: Quick system health check — services, disk, memory, processes. Use for periodic health monitoring.
---

# Health Check

Run all checks and report anomalies only (silent when healthy):

```bash
#!/bin/bash
ISSUES=""

# Disk > 85%
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
[ "$DISK_PCT" -gt 85 ] && ISSUES="${ISSUES}\n⚠️ Disk at ${DISK_PCT}%"

# Memory > 90%
MEM_PCT=$(free | awk '/Mem/{printf("%.0f", $3/$2*100)}')
[ "$MEM_PCT" -gt 90 ] && ISSUES="${ISSUES}\n⚠️ Memory at ${MEM_PCT}%"

# Services down
for svc in openclaw-poe-gateway openclaw-argus-gateway; do
    status=$(systemctl --user is-active $svc 2>/dev/null)
    [ "$status" != "active" ] && ISSUES="${ISSUES}\n❌ $svc is $status"
done

# High load (> 4.0 on a typical system)
LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk -F, '{print $1}' | xargs)
HIGH=$(echo "$LOAD > 4.0" | bc -l 2>/dev/null || echo 0)
[ "$HIGH" = "1" ] && ISSUES="${ISSUES}\n⚠️ High load: $LOAD"

if [ -n "$ISSUES" ]; then
    echo -e "🚨 Health Issues:$ISSUES"
else
    echo "✅ All systems healthy"
fi
```

When used in /loop, only alert when issues are found.
