---
name: file-manager
description: File operations — organize, search, backup, manage files and directories. Use for any file management task.
---

# File Manager

## Preferred Tools
- `eza` over `ls` (better formatting, git integration)
- `fd` over `find` (faster, smarter)
- `rg` over `grep` (faster, recursive by default)
- `dust` over `du` (visual disk usage)
- `bat` over `cat` (syntax highlighting)
- `trash` over `rm` (recoverable)

## Common Patterns
```bash
# Find files
fd "pattern" /path

# Search file contents
rg "pattern" /path

# Directory listing with details
eza -la --git --icons /path

# Disk usage breakdown
dust -n 20 /path

# Safe delete
trash file_or_dir

# Backup before editing
cp file file.bak.$(date +%Y%m%d)
```

## Safety Rules
- ALWAYS `trash` instead of `rm`
- ALWAYS `cp` backup before mutating important files
- Ask before bulk operations
