#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
account="$(id -un)"
expected_dir="/home/$account/projects/aterum/aterum_gui"
[[ "$account" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Unsupported account name.' >&2; exit 1; }
[[ "$repo_dir" == "$expected_dir" ]] || { echo "This systemd template expects $expected_dir" >&2; exit 1; }
[[ -x /usr/bin/node ]] || { echo 'Install Node 22 at /usr/bin/node first.' >&2; exit 1; }
if ! sudo -n true 2>/dev/null; then sudo -v; fi

install -d -m 0755 "$HOME/.local/bin"
wrapper="$HOME/.local/bin/aterum"
printf '#!/usr/bin/env bash\nexec /usr/bin/node %q "$@"\n' "$repo_dir/scripts/aterum-control.js" > "$wrapper"
chmod 0755 "$wrapper"

sudo install -m 0644 "$repo_dir/ops/systemd/aterum-stack@.service" /etc/systemd/system/aterum-stack@.service
sudo install -m 0644 "$repo_dir/ops/systemd/aterum-gui-tunnel@.service" /etc/systemd/system/aterum-gui-tunnel@.service

# Narrow permission for unattended control of this user's tunnel; no arbitrary systemctl access.
temp_rule="$(mktemp)"
trap 'rm -f "$temp_rule"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl start aterum-gui-tunnel@%s.service, /usr/bin/systemctl stop aterum-gui-tunnel@%s.service\n' "$account" "$account" "$account" > "$temp_rule"
sudo visudo -cf "$temp_rule" >/dev/null
sudo install -m 0440 "$temp_rule" "/etc/sudoers.d/aterum-control-$account"

# Adopt only an already-running installation. A fresh PC remains blocked until explicit handoff.
/usr/bin/node - "$repo_dir" <<'NODE'
const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const repo=process.argv[2];const {HostController}=require(path.join(repo,'scripts/aterum-control'));
const controller=new HostController();
if(!controller.state()){
 const services=execFileSync('docker',['compose','--profile','trading','--profile','ai','--profile','aux','ps','--services','--status','running'],{cwd:repo,encoding:'utf8'}).trim().split(/\s+/);
 const active=['n8n','position_guard','dashboard','telegram_control'].every(s=>services.includes(s));
 if(!active)controller.inhibit();
 controller.save({mode:active?'ACTIVE':'STOPPED',migrationReady:false,requiresHandoff:!active,adoptedAt:new Date().toISOString()});
}
NODE

# Replace a previous non-template boot unit without starting or stopping the live stack.
if [[ "$(systemctl show --property=LoadState --value aterum-stack.service)" != "not-found" ]]; then
  sudo systemctl disable aterum-stack.service
fi
sudo systemctl daemon-reload
sudo systemctl enable "aterum-stack@$account.service"
echo "Installed: $wrapper"
echo 'No containers were started or stopped. Use aterum status, start, stop or migrate.'
