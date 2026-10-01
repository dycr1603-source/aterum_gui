#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$repo_dir" =~ ^/home/([a-z_][a-z0-9_-]*)/projects/aterum/aterum_gui$ ]] || { echo 'Unsupported repository location' >&2; exit 1; }
account="${BASH_REMATCH[1]}"
caller="$(id -un)"
[[ "$caller" == root || "$caller" == "$account" ]] || { echo 'Run as project owner or root' >&2; exit 1; }
distro="${WSL_DISTRO_NAME:-}"
[[ "$distro" =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Run inside the target WSL distribution with WSL_DISTRO_NAME available' >&2; exit 1; }
[[ -x /usr/bin/node && -x /mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe ]] || { echo 'WSL Windows interop or Node unavailable' >&2; exit 1; }
if [[ "$caller" == root ]]; then privileged=(); as_account=(runuser -u "$account" --); else privileged=(sudo); as_account=(); fi
windows_localappdata="$("${as_account[@]}" powershell.exe -NoProfile -NonInteractive -Command '$env:LOCALAPPDATA' | tr -d '\r')"
[[ "$windows_localappdata" =~ ^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local$ ]] || { echo 'Windows LOCALAPPDATA unavailable' >&2; exit 1; }
windows_dir="$windows_localappdata\\Aterum"
linux_dir="$(wslpath -u "$windows_dir")"
"${as_account[@]}" install -d -m 0700 "$linux_dir" "/home/$account/.local/state/aterum-shutdown"
"${as_account[@]}" install -m 0600 "$repo_dir/ops/windows/controlled-shutdown.ps1" "$linux_dir/controlled-shutdown.ps1"
"${as_account[@]}" /usr/bin/node - "$distro" "$account" "$windows_dir\\controlled-shutdown.ps1" <<'NODE'
const fs=require('fs'),os=require('os'),path=require('path');
const [distro,user,windowsScript]=process.argv.slice(2);
const dir=path.join(os.homedir(),'.local/state/aterum-shutdown');
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({distro,user,windowsScript,
 controlScript:`/home/${user}/projects/aterum/aterum_gui/scripts/aterum-control.js`})+'\n',{mode:0o600});
NODE
"${privileged[@]}" install -m 0644 "$repo_dir/ops/systemd/aterum-shutdown-bridge@.service" /etc/systemd/system/aterum-shutdown-bridge@.service
"${privileged[@]}" systemctl daemon-reload
"${privileged[@]}" systemctl enable --now "aterum-shutdown-bridge@$account.service"
echo 'Shutdown scheduler bridge installed. No shutdown was scheduled.'
