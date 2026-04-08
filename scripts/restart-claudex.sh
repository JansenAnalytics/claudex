#!/bin/bash
# Restart Claudex
echo "🔄 Restarting Claudex..."
bash "$(dirname "$0")/stop-claudex.sh"
sleep 3
bash "$(dirname "$0")/start-claudex.sh"
