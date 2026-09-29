#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGROK_PATH="$HOME/.local/bin/ngrok"

if ! node -e "require('./services/load_env'); if(!process.env.NGROK_AUTHTOKEN || /^(change_me|replace_me|example)/i.test(process.env.NGROK_AUTHTOKEN)) process.exit(1)"; then
  echo 'Configura NGROK_AUTHTOKEN en aterum_gui/.env y vuelve a ejecutar este instalador.' >&2
  exit 78
fi

if [[ ! -x "$NGROK_PATH" ]]; then
  install -d -m 0755 "$(dirname "$NGROK_PATH")"
  download_dir="$(mktemp -d)"
  trap 'rm -rf "$download_dir"' EXIT
  curl -fsSL https://bin.ngrok.com/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz | tar -xz -C "$download_dir"
  install -m 0755 "$download_dir/ngrok" "$NGROK_PATH"
fi

"$NGROK_PATH" version >/dev/null
sudo -n install -m 0644 "$REPO_DIR/ops/systemd/aterum-gui-tunnel@.service" /etc/systemd/system/aterum-gui-tunnel@.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "aterum-gui-tunnel@$(id -un).service"
echo 'Enabled aterum-gui-tunnel for this WSL user.'
