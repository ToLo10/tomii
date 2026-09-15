# Chatify - Render + MongoDB Atlas

## What this build does
- Runs the Node.js + Socket.IO server on Render without keeping a laptop on.
- Loads/saves the Chatify application state in MongoDB Atlas when `MONGODB_URI` is configured.
- Stores uploaded files in MongoDB GridFS when MongoDB is connected, with the existing local `uploads/` directory as a development fallback.
- Persists login sessions in the same cloud state so normal Render restarts do not automatically sign everybody out.
- Adds `/api/health` for Render health checks.
- Adds account Settings for display name, password and avatar.
- Adds an owner-managed avatar-frame library, with delegated `manage_frames`
  permission for assigning/removing frames from user accounts.
- Uses `GIPHY_API_KEY` through the authenticated sticker-search proxy.
- TURN credentials are passed to the WebRTC client; `FORCE_TURN_RELAY=true` forces calls to use TURN relay.
- Telegram moderation archive is disabled by default. If enabled, Chatify shows a visible notice and attempts to separate rooms with Telegram Topics.

## Render setup
1. Put the project in a private Git repository.
2. Create a Render Web Service, or use `render.yaml`.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add the environment variables from `.env.example` in Render > Environment.
6. Do not upload `.env` to Git.

For animated stickers, set `GIPHY_API_KEY` to the API key from GIPHY in the
Render Environment settings. The key is read server-side; do not paste it into
`room.html` or a public JavaScript file.

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

## Memory and upload stability
The memory guard reports RSS, V8 heap, external memory and ArrayBuffer memory.
RSS alone is not treated as a fatal condition because native allocator pages can
remain resident after a streamed upload finishes. Keep
`MEMORY_GUARD_RESTART=false` on the small Render instance; enable it only when
the Render logs show sustained Heap/external-buffer pressure and the thresholds
have been adjusted for the selected plan. The service also limits concurrent
  upload requests with `MAX_CONCURRENT_UPLOAD_REQUESTS` (default `6`).

Large chat videos use resumable 8MB chunks by default (`UPLOAD_CHUNK_SIZE`),
so a mobile reconnect resumes from the last confirmed byte. The completed video
is served immediately from the exact local byte copy while GridFS persistence
finishes in the background; GridFS remains the durable source after migration.

To make phone-camera HEVC/H.265, MKV and other desktop-incompatible videos play
with both picture and sound, the server checks the uploaded file with `ffprobe`
and prepares an H.264/AAC MP4 compatibility copy with `ffmpeg` in a single
background queue. The original file is kept intact, and the upload response is
not held open for conversion. Render's native Node runtime includes both tools.
The relevant controls are `VIDEO_COMPATIBILITY_ENABLED`,
`VIDEO_COMPATIBILITY_MAX_BYTES`, `VIDEO_COMPATIBILITY_MAX_QUEUE` and
`VIDEO_COMPATIBILITY_TIMEOUT_MS`. Set the first one to `false` only if a local
deployment intentionally has no ffmpeg installation.

When MongoDB is configured, the local JSON backup is disabled by default to
avoid synchronous full-state serialization on every message. Set
`WRITE_LOCAL_JSON_BACKUP=true` only when that local backup is deliberately
required.
