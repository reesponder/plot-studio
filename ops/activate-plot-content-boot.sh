#!/bin/bash
set -euo pipefail
IFS= read -r password
[[ -n "$password" ]]
app=/srv/plot-studio
stage=$(dirname "$0")
dropin_dir=/etc/systemd/system/plot-studio.service.d
dropin="$dropin_dir/91-studio-content.conf"
exec 9>/run/lock/plot-studio-deploy.lock
flock -x 9
previous=$(readlink -f "$app/current")
release="$app/releases/content-boot-$(date -u +%Y%m%dT%H%M%SZ)"
[[ "$previous" == "$app/releases/"* && -d "$previous" && ! -e "$release" ]]
test -r /etc/letsencrypt/live/plotstudio-content/fullchain.pem
test -r /etc/nginx/sites-enabled/plotstudio-content.conf
install -d -m 0755 "$release"
cp -a --reflink=auto "$previous/." "$release/"
tar -xzf "$stage/release.tar.gz" -C "$release" --no-same-owner --no-same-permissions
while IFS= read -r file; do
  if [[ "$file" == *.mjs ]]; then node --check "$release/$file"; fi
done < <(tar -tzf "$stage/release.tar.gz")
test -s "$release/studio-build/editor.mjs"
had_dropin=false
if [[ -f "$dropin" ]]; then cp -p "$dropin" "$stage/dropin.previous"; had_dropin=true; fi

switch_release() {
  ln -sfn "$1" "$app/.content-boot-next"
  mv -Tf "$app/.content-boot-next" "$app/current"
}
rollback() {
  status=$?
  trap - EXIT
  if [[ "$status" != 0 ]]; then
    if $had_dropin; then install -m 0644 "$stage/dropin.previous" "$dropin"; else rm -f -- "$dropin"; fi
    switch_release "$previous"
    systemctl daemon-reload
    systemctl restart plot-studio
    printf 'RESTORED_PREVIOUS_RELEASE\n' >&2
  fi
  exit "$status"
}
trap rollback EXIT
install -d -m 0755 "$dropin_dir"
printf '[Service]\nEnvironment=PLOT_STUDIO_DISTRIBUTED_BOOT=1\n' > "$stage/dropin.new"
install -m 0644 "$stage/dropin.new" "$dropin"
systemctl daemon-reload
switch_release "$release"
systemctl restart plot-studio
for attempt in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:14990/sign-in -o /dev/null 2>/dev/null; then break; fi
  sleep 1
done
systemctl is-active --quiet plot-studio
printf '%s\n' "$password" | PLOT_EXPECT_DISTRIBUTED_BOOT=1 python3 "$stage/verify-studio-rotation.py"
unset password
trap - EXIT
printf 'PLOT_STUDIO_CONTENT_LIVE %s\nPREVIOUS_RELEASE %s\n' "$release" "$previous"
