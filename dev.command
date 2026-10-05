#!/bin/bash
# PeerScore — lance l'environnement de dev (double-clic depuis le Finder, ou ./dev.command)
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "== PeerScore dev =="

if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop n'est pas démarré, lancement..."
    open -a Docker 2>/dev/null
    for i in $(seq 1 30); do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
  fi
  if docker info >/dev/null 2>&1; then
    echo "-> docker compose up --build -V  (http://localhost:3000)"
    exec docker compose up --build --renew-anon-volumes
  fi
  echo "Docker injoignable, bascule sur npm."
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Ni Docker ni Node/npm disponibles. Installe Docker Desktop ou Node.js puis relance."
  read -r -p "Entrée pour fermer..."
  exit 1
fi

# node_modules a été installé depuis un sandbox Linux : réinstallation pour macOS si nécessaire
if ! ls -d node_modules/@next/swc-darwin-* >/dev/null 2>&1; then
  echo "node_modules non compatible macOS, réinstallation..."
  rm -rf node_modules
  npm install
fi

echo "-> npm run dev  (http://localhost:3000)"
exec npm run dev
