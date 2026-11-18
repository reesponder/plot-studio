#!/bin/bash
set -euo pipefail
IFS= read -r password
[[ -n "$password" ]]
app=/srv/plot-studio
stage=$(dirname "$0")
exec 9>/run/lock/plot-studio-deploy.lock
flock -x 9
previous=$(readlink -f "$app/current")
release="$app/releases/alias-per-entry-$(date -u +%Y%m%dT%H%M%SZ)"
[[ "$previous" == "$app/releases/"* && -d "$previous" && ! -e "$release" ]]
install -d -m 0755 "$release"
cp -a --reflink=auto "$previous/." "$release/"
tar -xzf "$stage/release.tar.gz" -C "$release" --no-same-owner --no-same-permissions
while IFS= read -r file; do
  case "$file" in
    *.mjs) node --check "$release/$file" ;;
    *.py) python3 -c 'import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())' "$release/$file" ;;
  esac
done < <(tar -tzf "$stage/release.tar.gz")

switch_release() {
  ln -sfn "$1" "$app/.alias-per-entry-next"
  mv -Tf "$app/.alias-per-entry-next" "$app/current"
}
rollback() {
  status=$?
  trap - EXIT
  if [[ "$status" != 0 ]]; then
    switch_release "$previous"
    systemctl restart plot-studio
    printf 'RESTORED_PREVIOUS_RELEASE\n' >&2
  fi
  exit "$status"
}
trap rollback EXIT
switch_release "$release"
systemctl restart plot-studio
for attempt in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:14990/sign-in -o /dev/null 2>/dev/null; then break; fi
  sleep 1
done
systemctl is-active --quiet plot-studio
printf '%s\n' "$password" | python3 "$stage/verify-studio-rotation.py"
unset password
trap - EXIT
printf 'PLOT_ALIAS_PER_ENTRY_LIVE %s\nPREVIOUS_RELEASE %s\n' "$release" "$previous"
