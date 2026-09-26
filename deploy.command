#!/bin/bash
# Double-click me in Finder to ship ReelOrder to production (runs ship.sh in a real Terminal).
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"
echo "ReelOrder deploy - $(date)"
echo "Folder: $(pwd)"
bash ship.sh
STATUS=$?
echo
if [ $STATUS -eq 0 ]; then echo "DEPLOY OK"; else echo "DEPLOY FAILED (exit $STATUS)"; fi
echo "You can close this window."
