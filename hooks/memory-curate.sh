#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ DEPRECATED (2026-06-12) — DO NOT WIRE THIS INTO settings.json "Stop".      ║
# ║                                                                            ║
# ║ This Stop-hook wrapper spawned `claude -p`, which loaded the user-level    ║
# ║ telegram plugin from ANY cwd; the plugin's server.ts SIGTERMs whatever     ║
# ║ PID holds bot.pid before taking over polling — so EVERY curate run killed  ║
# ║ the live Telegram channel. It was removed twice before the root cause     ║
# ║ was identified. (Also: Stop fires every turn in channel mode — wrong       ║
# ║ trigger for curation in the first place.)                                  ║
# ║                                                                            ║
# ║ Curation now runs from cron:                                               ║
# ║   crontab: 17 */2 * * *  scripts/memory-curate-cron.sh                     ║
# ║   logic:   scripts/memory-curate.cjs --scan   (byte-offset transcript      ║
# ║            scanning + plugin-isolated `claude -p` spawn; see its header)   ║
# ║ Evidence + design: memory/2026-06-12.md                                    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
echo "[$(date '+%F %T')] memory-curate.sh is DEPRECATED — curation runs via cron (scripts/memory-curate-cron.sh). Not doing anything." \
  >> "${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}/logs/memory-curate.log" 2>/dev/null || true
exit 0
