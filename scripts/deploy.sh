#!/bin/bash
# Deploys the currently-committed state of main to the Lightsail server:
# push to GitHub, then have the server pull, rebuild, and restart.
# Run this AFTER committing your changes locally — it doesn't commit for you.
set -e

SERVER="admin@16.60.74.221"
SSH_KEY="$HOME/.ssh/io_game_lightsail"

echo "→ Pushing to GitHub..."
git push

echo "→ Deploying on server..."
ssh -i "$SSH_KEY" "$SERVER" '
  set -e
  cd /home/admin/io-game
  git pull
  npm install
  npm run build
  sudo systemctl restart io-game
  sudo systemctl restart caddy
'

echo "→ Done. Live at https://play.bithal.net"
