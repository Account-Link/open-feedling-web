#!/usr/bin/env bash
# Read YouTube/Google session cookies from your local Chrome profile and emit
# them in Playwright's addCookies() format (an array of cookie records).
# Lifted from oauth3/yt-testing/setup_short_check.sh.
#
# Requires: python3 with browser_cookie3 (`pip install browser_cookie3`)
#
# Usage:
#   ./record-cookies.sh > cookies.json
#   gh secret set YT_COOKIES_JSON < cookies.json
set -euo pipefail

python3 <<'PY'
import browser_cookie3, json

ESSENTIAL = {
    'SID', 'HSID', 'SSID', 'APISID', 'SAPISID',
    '__Secure-1PSID', '__Secure-3PSID',
    '__Secure-1PAPISID', '__Secure-3PAPISID',
    'LOGIN_INFO', 'PREF', 'SIDCC',
    '__Secure-1PSIDCC', '__Secure-3PSIDCC',
    '__Secure-1PSIDTS', '__Secure-3PSIDTS',
}

cookies = []
for domain in ['.youtube.com', '.google.com']:
    for c in browser_cookie3.chrome(domain_name=domain):
        if c.name not in ESSENTIAL:
            continue
        cookies.append({
            'name': c.name,
            'value': c.value,
            'domain': c.domain,
            'path': c.path or '/',
            'secure': bool(c.secure),
            'httpOnly': False,
            'sameSite': 'Lax',
        })

# Deduplicate by name; prefer .youtube.com over .google.com on conflict.
seen = {}
for c in cookies:
    if c['name'] not in seen or c['domain'] == '.youtube.com':
        seen[c['name']] = c

print(json.dumps(list(seen.values()), indent=2))
PY
