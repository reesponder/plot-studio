#!/bin/bash
set -euo pipefail
IFS= read -r password
[[ -n "$password" ]]
app=/srv/plot-studio
stage=$(dirname "$0")
vhost=/etc/nginx/sites-enabled/plotstudio-dns.conf
exec 9>/run/lock/plot-studio-deploy.lock
flock -x 9
previous=$(readlink -f "$app/current")
release="$app/releases/alias-names-$(date -u +%Y%m%dT%H%M%SZ)"
[[ "$previous" == "$app/releases/"* && -d "$previous" && ! -e "$release" ]]
cp -p "$vhost" "$stage/vhost.previous"
python3 - "$vhost" "$stage/vhost.new" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
assert source.count('_studio-alias') == 1
Path(sys.argv[2]).write_text(source.replace('_studio-alias', 'xaxxaxaxaxa'))
PY
install -d -m 0755 "$release"
cp -a --reflink=auto "$previous/." "$release/"
tar -xzf "$stage/release.tar.gz" -C "$release" --no-same-owner --no-same-permissions
node --check "$release/server.mjs"
switch_release() {
  ln -sfn "$1" "$app/.alias-names-next"
  mv -Tf "$app/.alias-names-next" "$app/current"
}
rollback() {
  status=$?
  trap - EXIT
  if [[ "$status" != 0 ]]; then
    install -m 0644 "$stage/vhost.previous" "$vhost"
    switch_release "$previous"
    systemctl restart plot-studio
    if /usr/sbin/nginx -t > "$stage/nginx-rollback.log" 2>&1; then systemctl reload nginx; fi
    printf 'RESTORED_PREVIOUS_RELEASE\n' >&2
  fi
  exit "$status"
}
trap rollback EXIT
install -m 0644 "$stage/vhost.new" "$vhost"
if ! /usr/sbin/nginx -t > "$stage/nginx-check.log" 2>&1; then cat "$stage/nginx-check.log"; exit 1; fi
switch_release "$release"
systemctl restart plot-studio
systemctl reload nginx
for attempt in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:14990/sign-in -o /dev/null 2>/dev/null; then break; fi
  sleep 1
done
systemctl is-active --quiet plot-studio nginx
printf '%s\n' "$password" | PLOT_EXPECT_DISTRIBUTED_BOOT=1 python3 "$stage/verify-studio-rotation.py"
unset password
trap - EXIT
printf 'PLOT_ALIAS_NAMES_LIVE %s\nPREVIOUS_RELEASE %s\n' "$release" "$previous"
