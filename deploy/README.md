# Deploying OpenFeedling with a VPN sidecar

This compose stack runs the OpenFeedling server **plus an OpenVPN→SOCKS5 sidecar**, so all outbound HTTPS to YouTube routes through your own VPN provider's residential-ish IP instead of your cloud host's datacenter IP.

Use this if:
- You're deploying to a VPS, Fly.io, Render, etc., and want to insulate against YouTube flagging the datacenter source IP
- You have a paid VPN account (ProtonVPN, Mullvad, AirVPN) and want to put it to work

If you're running OpenFeedling on your laptop or home server, you don't need this — your residential IP is already the cleanest egress.

## How it works

```
your-server (cloud)
├── vpn container       ← runs OpenVPN tunnel + SOCKS5 on :1080
│   (egress: VPN provider's IP)
└── server container    ← OpenFeedling, sets HTTPS_PROXY=socks5://vpn:1080
    └── youtube.com requests → vpn:1080 → OpenVPN tunnel → VPN provider
```

Web Push delivery (FCM, Mozilla autopush) **bypasses** the VPN via `NO_PROXY` — those services often reject VPN egress.

## Quickstart

```bash
cd deploy
cp .env.example .env

# 1. Generate VAPID + secret if you don't have them
deno task gen-vapid >> .env  # (run from repo root, then move keys here)
echo "EXT_SHARED_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Get a .ovpn from your VPN provider
#    ProtonVPN: https://account.protonvpn.com/downloads
#    Mullvad:   https://mullvad.net/en/account/openvpn-config
# 3. Encode it as a single base64 line and paste into .env
echo "OVPN_CONFIG_BASE64=$(base64 -w0 your-config.ovpn)" >> .env

# 4. Add your VPN account credentials
echo "OPENVPN_USER=your-vpn-username" >> .env
echo "OPENVPN_PASS=your-vpn-password" >> .env

# 5. Boot
docker compose up --build -d
docker compose logs -f
```

Watch the logs until you see:
- `[openvpn] tunnel established` (or similar) on the vpn container
- `[init] ready — idle=300000ms` on the server container

## Verify the egress is going through the VPN

```bash
# What IP does YouTube see?
docker compose exec server sh -c 'curl -s --max-time 10 https://api.ipify.org'
# Compare to the host's direct IP
curl -s https://api.ipify.org
```

The server's IP should differ from the host's, and ideally not be a known datacenter range.

## Troubleshooting

- **VPN container exits immediately** — check `docker compose logs vpn`. Most likely: bad `OVPN_CONFIG_BASE64`, wrong auth, or the .ovpn references files (CRL/cert) that aren't bundled. ProtonVPN's standard configs work; some providers split certs into separate files which won't survive the base64 encoding.
- **Server container can't reach `vpn:1080`** — make sure both containers are on the same compose network (default is fine if they're in this compose file together).
- **YouTube returns the same IP as before** — the VPN tunnel may not have come up but SOCKS5 is still listening. Check `docker compose exec vpn ip addr` for a `tun0` interface.
- **Web Push fails** — FCM blocks many VPN providers. The `NO_PROXY` list in `docker-compose.yml` keeps push delivery off-VPN; if you change VPN providers, you may need to add their FCM-blocking exception.

## VPN providers tested

The `curve25519xsalsa20poly1305/openvpn-socks5` base image has been used in production with **ProtonVPN** for over a year (per the [tiktok-dstack deployment](../README.md#credits)). Other providers (Mullvad, AirVPN, NordVPN) should work as long as they hand you a standard `.ovpn` file with `auth-user-pass`.

---

_Verified end-to-end with the `test/` Playwright spec on 2026-04-26 against a ProtonVPN US tunnel — extension cookie sync → InnerTube poll → push delivery all green._
