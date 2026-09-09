# Chatify + Cloudflare Realtime TURN

## 1. Create a TURN key
In Cloudflare Dashboard open **Realtime / TURN** and create a TURN key for Chatify (for example `tomi-production`).

Cloudflare will provide two server-side values:
- TURN Key ID / Token ID (UID)
- TURN Key API Token

Never put the API token in HTML, JavaScript sent to the browser, GitHub, or screenshots.

## 2. Render Environment Variables
Add:

```text
CLOUDFLARE_TURN_KEY_ID=<your TURN key UID>
CLOUDFLARE_TURN_API_TOKEN=<your TURN key API token>
CLOUDFLARE_TURN_TTL_SECONDS=86400
FORCE_TURN_RELAY=false
```

`FORCE_TURN_RELAY=false` is recommended: WebRTC can use a direct path when possible and Cloudflare TURN becomes the fallback. Set it to `true` only when you intentionally want every call to be relayed.

The old variables below are optional and should normally stay empty when Cloudflare TURN is enabled:

```text
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
```

## 3. Deploy and verify
After Render redeploys, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

You should see:

```json
{"ok":true,"database":"mongodb","fileStorage":"mongodb-gridfs","turn":"cloudflare"}
```

## How the integration works
The browser never receives the long-lived Cloudflare TURN key. Before a call, Chatify asks its own authenticated backend at `/api/turn-credentials`. The backend calls Cloudflare and returns temporary ICE server credentials. These credentials are cached per signed-in user and refreshed before expiry.
