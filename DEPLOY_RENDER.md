# Chatify - Render + MongoDB Atlas

## What this build does
- Runs the Node.js + Socket.IO server on Render without keeping a laptop on.
- Loads/saves the Chatify application state in MongoDB Atlas when `MONGODB_URI` is configured.
- Stores every new non-empty chat attachment (images, GIFs, videos, audio and files) in Cloudflare R2 with direct browser-to-bucket multipart transfer. Render receives only authorization, multipart ETags and small MongoDB metadata; it does not spool chat media to disk or RAM. Existing MongoDB GridFS files remain readable for old messages.
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
For the recommended production setup, follow [R2_SETUP.md](R2_SETUP.md). New
browser uploads then go directly to Cloudflare R2 and playback is served from a
short-lived signed R2 URL, so large media does not consume the Node host's
upload/download bandwidth. Older GridFS files continue to work through the
authorized `/api/files/:fileId` route.

`REQUIRE_EXTERNAL_MEDIA_STORAGE=true` is enabled in `render.yaml`. If R2 is not
configured, new chat and Explore media are rejected with a clear setup error
instead of being written to Render's disposable disk. This prevents a restart
or a full disk from turning a successful-looking upload into a missing message.

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

Large chat media uses resumable 8MB R2 multipart parts by default
(`R2_PART_SIZE_BYTES`), so a mobile reconnect resumes from the last confirmed
ETag. The browser keeps only one large media upload active at a time; additional
videos wait in a bounded queue. Render only signs the next part and records its
ETag, so sending several videos does not create complete local copies or a
second GridFS copy. The same R2 multipart session is restored from MongoDB after
a process restart.

Video compatibility transcoding is disabled by default in this stability build:
it would require downloading a complete R2 object and creating another local
file on Render. If it is deliberately enabled with
`VIDEO_COMPATIBILITY_ENABLED=true` **and**
`VIDEO_COMPATIBILITY_ALLOW_SERVER_WORKER=true`, it consumes server CPU/disk and
should be used only on a larger instance.

When MongoDB is configured, the local JSON backup is disabled by default to
avoid synchronous full-state serialization on every message. Production also
sets `REQUIRE_MONGODB=true` and `ALLOW_LOCAL_JSON_FALLBACK=false`; a temporary
MongoDB outage stops the process and lets Render retry instead of booting with
an empty disposable database that looks like deleted chats.
