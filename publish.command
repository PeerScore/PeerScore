#!/bin/bash
# PeerScore — pousse la branche main sur GitHub avec ta clé SSH (double-clic depuis le Finder).
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "== PeerScore publish =="
git remote get-url origin >/dev/null 2>&1 || git remote add origin git@github.com:PeerScore/PeerScore.git
git remote set-url origin git@github.com:PeerScore/PeerScore.git
git status --short | head -20
echo
echo "-> git push -u origin main"
git push -u origin main
echo
read -r -p "Entrée pour fermer..."
