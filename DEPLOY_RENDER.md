# Chatify - Render + MongoDB Atlas

## What this build does
- Runs the Node.js + Socket.IO server on Render without keeping a laptop on.
- Loads/saves the Chatify application state in MongoDB Atlas when `MONGODB_URI` is configured.
- Stores uploaded files in MongoDB GridFS when MongoDB is connected, with the existing local `uploads/` directory as a development fallback.
- Persists login sessions in the same cloud state so normal Render restarts do not automatically sign everybody out.
- Adds `/api/health` for Render health checks.
- Adds account Settings for display name, password and avatar.
- Adds owner-only avatar-frame library, timed/permanent assignment and removal.
- TURN credentials are passed to the WebRTC client; `FORCE_TURN_RELAY=true` forces calls to use TURN relay.
- Telegram moderation archive is disabled by default. If enabled, Chatify shows a visible notice and attempts to separate rooms with Telegram Topics.

## Render setup
1. Put the project in a private Git repository.
2. Create a Render Web Service, or use `render.yaml`.
3. Build command: `npm ci`
4. Start command: `npm start`
5. Add the environment variables from `.env.example` in Render > Environment.
6. Do not upload `.env` to Git.

## MongoDB Atlas
Set `MONGODB_URI` to your Atlas connection string. On the first successful cloud start, if the Chatify state document does not exist, the server seeds MongoDB from `chat_database.json`. Future saves go to MongoDB automatically.

After confirming the cloud data is correct, keep a private backup of `chat_database.json`; do not publish it because it can contain account and conversation data.

## Files
With MongoDB connected, new uploads are placed in the `chatifyUploads` GridFS bucket. This avoids relying on Render's ephemeral filesystem for persistent chat media.

## Calls
For basic WebRTC calls, STUN is included. For reliable cloud-hosted calls add a TURN service:
- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

Set `FORCE_TURN_RELAY=true` only after TURN is working. In relay mode, media is routed through the TURN server and consumes TURN bandwidth.

## Telegram moderation archive
This build intentionally does not enable hidden copying of private chats. If your service policy clearly informs users that content can be archived/reviewed for moderation, set:
- `MODERATION_ARCHIVE_ENABLED=true`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

For one topic per room, the Telegram destination should be a forum-enabled supergroup and the bot needs permission to create/manage topics. If topics are unavailable, messages fall back to the main chat.

`TELEGRAM_MAX_COPY_BYTES` controls the maximum uploaded file size copied into Telegram (default 20 MB). Larger files are logged as metadata instead of being loaded into server memory for Telegram forwarding.


## Cloudflare Realtime TURN
Add these Render Environment Variables after creating a Cloudflare TURN key:

```text
CLOUDFLARE_TURN_KEY_ID=<TURN key UID / Token ID>
CLOUDFLARE_TURN_API_TOKEN=<TURN key API token>
CLOUDFLARE_TURN_TTL_SECONDS=86400
FORCE_TURN_RELAY=false
```

Do **not** put the TURN API token in `room.html`, GitHub, or any browser-side file.
After redeploy, `/api/health` should show `"turn":"cloudflare"`.

The app generates short-lived ICE credentials server-side through:
`https://rtc.live.cloudflare.com/v1/turn/keys/<KEY_ID>/credentials/generate-ice-servers`.
