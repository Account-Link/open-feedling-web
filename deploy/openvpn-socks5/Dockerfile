# OpenVPN → SOCKS5 sidecar.
# Wraps curve25519xsalsa20poly1305/openvpn-socks5 with a custom entrypoint
# that decodes the OVPN config from an env var so users can BYO their own
# .ovpn (e.g. from ProtonVPN, Mullvad, AirVPN) without baking it into the image.
#
# Lifted from amiller's tiktok-dstack production deployment:
#   ~/projects/teleport/envoy/openvpn-socks5/openvpn-socks5/

FROM curve25519xsalsa20poly1305/openvpn-socks5:latest

COPY entrypoint.sh /entrypoint-custom.sh
RUN chmod +x /entrypoint-custom.sh

ENTRYPOINT ["/entrypoint-custom.sh"]
