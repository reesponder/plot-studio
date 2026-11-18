#!/usr/bin/env bash
set -euo pipefail

stage=${1:-}
if [[ $# != 1 || ( "$stage" != prepare && "$stage" != activate ) ]]; then
  printf 'Usage: %s prepare|activate\n' "$0" >&2
  exit 2
fi

names=(
  dns-e82.plotstudio.pro dns-k47.plotstudio.pro dns-m13.plotstudio.pro dns-r68.plotstudio.pro
  dns-t29.plotstudio.pro dns-v54.plotstudio.pro dns-x31.plotstudio.pro dns-z76.plotstudio.pro
)
acme=/var/www/plotstudio-acme
certificate_name=plotstudio-dns
certificate=/etc/letsencrypt/live/$certificate_name
vhost=/etc/nginx/sites-enabled/plotstudio-dns.conf
hook=/etc/letsencrypt/renewal-hooks/deploy/plotstudio-dns-nginx
upstream=/etc/nginx/snippets/plot-studio-upstream.conf
managed='# Managed by activate-plot-studio-alias-nginx.sh'

exec 9>/run/lock/plot-studio-alias-nginx.lock
flock 9
for path in "$vhost" "$hook"; do
  if [[ -L "$path" ]] || { [[ -e "$path" ]] && ! grep -Fxq -- "$managed" "$path"; }; then
    printf 'Refusing to overwrite unmanaged path %s\n' "$path" >&2
    exit 1
  fi
done

scratch=$(mktemp -d)
probe=
pending=
config_changed=false
hook_changed=false
if [[ -f "$vhost" ]]; then cp -p -- "$vhost" "$scratch/vhost.previous"; fi
if [[ -f "$hook" ]]; then cp -p -- "$hook" "$scratch/hook.previous"; fi

install_atomic() {
  local source=$1 destination=$2 mode=$3
  pending=$(mktemp "$(dirname "$destination")/.$(basename "$destination").XXXXXX")
  install -m "$mode" -- "$source" "$pending"
  mv -fT -- "$pending" "$destination"
  pending=
}

restore() {
  local backup=$1 destination=$2 mode=$3
  if [[ -f "$backup" ]]; then
    install_atomic "$backup" "$destination" "$mode"
  else
    rm -f -- "$destination"
  fi
}

finish() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$probe" ]]; then rm -f -- "$probe"; fi
  if [[ -n "$pending" ]]; then rm -f -- "$pending"; fi
  if [[ "$status" != 0 ]]; then
    if $hook_changed; then restore "$scratch/hook.previous" "$hook" 0755; fi
    if $config_changed; then
      restore "$scratch/vhost.previous" "$vhost" 0644
      if /usr/sbin/nginx -t && systemctl reload nginx; then
        printf 'Restored previous alias configuration\n' >&2
      else
        printf 'Failed to reload previous alias configuration\n' >&2
      fi
    fi
  fi
  rm -f -- "$scratch/vhost.previous" "$scratch/hook.previous" "$scratch/vhost" "$scratch/hook"
  rmdir -- "$scratch"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

reload_nginx() {
  local output
  if ! output=$(/usr/sbin/nginx -t 2>&1) ||
     grep -Eq 'conflicting server name "dns-(e82|k47|m13|r68|t29|v54|x31|z76)\.plotstudio\.pro"' <<< "$output"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  systemctl reload nginx
}

write_vhost() {
  local mode=$1
  {
    printf '%s\n# Mode: %s\n' "$managed" "$mode"
    printf 'server {\n    listen 80;\n    listen [::]:80;\n    server_name %s;\n' "${names[*]}"
    cat <<'NGINX'
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/plotstudio-acme;
        default_type text/plain;
        try_files $uri =404;
    }
NGINX
    if [[ "$mode" == active ]]; then
      printf '    location / { return 308 https://$host$request_uri; }\n'
    else
      printf '    location / { return 404; }\n'
    fi
    printf '}\n'
    if [[ "$mode" != http ]]; then
      printf 'server {\n    listen 443 ssl http2;\n    listen [::]:443 ssl http2;\n    server_name %s;\n' "${names[*]}"
      printf '    ssl_certificate %s/fullchain.pem;\n    ssl_certificate_key %s/privkey.pem;\n' "$certificate" "$certificate"
      printf '    ssl_protocols TLSv1.2 TLSv1.3;\n'
      if [[ "$mode" == active ]]; then
        cat <<'NGINX'
    location ~ "^/(studio/?|xaxxaxaxaxa\.(mjs|css))?$" {
        if ($request_method !~ ^(GET|HEAD)$) { return 405; }
        include /etc/nginx/snippets/plot-studio-upstream.conf;
        proxy_set_header Cookie "";
        proxy_set_header Authorization "";
        proxy_hide_header Set-Cookie;
    }
NGINX
      fi
      printf '    location / { return 404; }\n}\n'
    fi
  } > "$scratch/vhost"
  config_changed=true
  install_atomic "$scratch/vhost" "$vhost" 0644
  reload_nginx
}

probe_acme() {
  local marker host response attempt
  probe=$(mktemp "$acme/.well-known/acme-challenge/plotstudio-dns-probe.XXXXXX")
  marker=${probe##*/}
  printf '%s' "$marker" > "$probe"
  chmod 0644 "$probe"
  for host in "${names[@]}"; do
    for attempt in {1..20}; do
      response=$(curl --noproxy '*' -fsS --max-time 5 --resolve "$host:80:127.0.0.1" \
        "http://$host/.well-known/acme-challenge/$marker" 2>/dev/null) || response=
      if [[ "$response" == "$marker" ]]; then break; fi
      sleep .25
    done
    if [[ "$response" != "$marker" ]]; then
      printf 'ACME route verification failed for %s\n' "$host" >&2
      return 1
    fi
  done
  rm -f -- "$probe"
  probe=
}

validate_certificate() {
  local sans host
  sans=$(openssl x509 -in "$certificate/fullchain.pem" -noout -ext subjectAltName | tr ',' '\n' | sed -n 's/^[[:space:]]*DNS://p' | sort)
  if [[ "$sans" != "$(printf '%s\n' "${names[@]}" | sort)" ]]; then
    printf 'Alias certificate SAN list does not match the configured names\n' >&2
    return 1
  fi
  openssl x509 -in "$certificate/fullchain.pem" -noout -checkend 0 >/dev/null
}

check_tls() {
  local mode=$1 host status unrelated attempt
  for host in "${names[@]}"; do
    for attempt in {1..20}; do
      status=$(curl --noproxy '*' -sS --max-time 8 --resolve "$host:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$host/studio/" 2>/dev/null) || status=
      if [[ "$mode" == staged && "$status" == 404 ]] ||
         [[ "$mode" == active && "$status" =~ ^(200|302|303|307|308)$ ]]; then break; fi
      sleep .25
    done
    if [[ "$mode" == staged ]]; then
      [[ "$status" == 404 ]] || { printf 'Expected staged 404 on %s, got %s\n' "$host" "$status" >&2; return 1; }
    elif [[ ! "$status" =~ ^(200|302|303|307|308)$ ]]; then
      printf 'Unexpected editor route status on %s: %s\n' "$host" "$status" >&2
      return 1
    fi
    unrelated=$(curl --noproxy '*' -sS --max-time 8 --resolve "$host:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$host/studio/api/")
    [[ "$unrelated" == 404 ]] || { printf 'Unexpected unrelated route status on %s: %s\n' "$host" "$unrelated" >&2; return 1; }
  done
}

if [[ "$stage" == prepare ]]; then
  install -d -m 0755 "$acme/.well-known/acme-challenge" "$(dirname "$hook")"
  mode=staged
  if [[ -f "$vhost" ]] && grep -Fxq '# Mode: active' "$vhost"; then
    mode=active
  else
    write_vhost http
  fi
  probe_acme
  arguments=()
  for host in "${names[@]}"; do arguments+=(-d "$host"); done
  certbot certonly --webroot -w "$acme" --non-interactive --agree-tos --keep-until-expiring \
    --cert-name "$certificate_name" "${arguments[@]}"
  validate_certificate

  cat > "$scratch/hook" <<'HOOK'
#!/bin/sh
# Managed by activate-plot-studio-alias-nginx.sh
case "${RENEWED_LINEAGE:-}" in
    /etc/letsencrypt/live/plotstudio-dns|/etc/letsencrypt/live/plotstudio-dns/)
        /usr/sbin/nginx -t && /bin/systemctl reload nginx
        ;;
esac
HOOK
  hook_changed=true
  install_atomic "$scratch/hook" "$hook" 0755
  write_vhost "$mode"
  check_tls "$mode"
  printf 'PLOT_STUDIO_ALIAS_TLS_READY\n'
else
  test -r "$certificate/fullchain.pem"
  test -r "$certificate/privkey.pem"
  test -r "$upstream"
  validate_certificate
  write_vhost active
  check_tls active
  printf 'PLOT_STUDIO_ALIAS_ROUTES_ACTIVE\n'
fi
