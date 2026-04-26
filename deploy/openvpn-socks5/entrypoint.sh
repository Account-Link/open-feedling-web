#!/bin/bash
set -e

mkdir -p /vpn

# Decode base64-encoded .ovpn from env var
if [[ -n "$OVPN_CONFIG_BASE64" ]]; then
  echo "$OVPN_CONFIG_BASE64" | base64 -d > /vpn/config.ovpn
  echo "[openvpn] config written from OVPN_CONFIG_BASE64 ($(wc -l < /vpn/config.ovpn) lines)"
else
  echo "[openvpn] ERROR: OVPN_CONFIG_BASE64 env var is required" >&2
  exit 1
fi

# Inject auth from env vars (most providers require user/pass)
if [[ -n "$OPENVPN_USER" && -n "$OPENVPN_PASS" ]]; then
  echo "$OPENVPN_USER" > /vpn/auth.txt
  echo "$OPENVPN_PASS" >> /vpn/auth.txt
  chmod 600 /vpn/auth.txt
  sed -i 's|^auth-user-pass$|auth-user-pass /vpn/auth.txt|' /vpn/config.ovpn
  echo "[openvpn] auth file created for user $OPENVPN_USER"
fi

# Strip resolvconf hooks — they fail in containers and we don't need them
# (Docker's embedded DNS handles name resolution).
sed -i '/up \/etc\/openvpn\/update-resolv-conf/d' /vpn/config.ovpn
sed -i '/down \/etc\/openvpn\/update-resolv-conf/d' /vpn/config.ovpn
sed -i '/script-security 2/d' /vpn/config.ovpn

export OPENVPN_CONFIG=/vpn/config.ovpn
echo "[openvpn] starting tunnel..."
exec /usr/local/bin/entrypoint.sh "$@"
