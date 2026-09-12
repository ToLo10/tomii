# Chatify Cloud Update

## Implemented in this build

### Render / always-on server
- Added `render.yaml` and `/api/health`.
- Server uses Render's `PORT` automatically.
- Added graceful cloud-state flush on shutdown.

### MongoDB Atlas
- `MONGODB_URI` activates cloud persistence.
- Existing `chat_database.json` is used as the initial seed if the MongoDB Chatify state does not exist yet.
- Login sessions are stored in the persisted state instead of a process-only Map.

### Cloud files
- New uploads are stored in MongoDB GridFS when MongoDB is connected.
- Local `uploads/` remains a development fallback only.
- Existing file authorization rules remain in front of GridFS downloads.

### Settings
- Added `Public/settings.html` and `Public/settings.css`.
- Users can change their display name.
- Users can change password after entering the current password.
- Users can upload/change account photo.
- Settings link added to the main page and conversation sidebar.

### Owner Frames
- Owner-only frame library.
- Owner can upload PNG/WebP/GIF-style frame images.
- Owner can assign a frame to any account for N days or permanently.
- Owner can remove an assigned frame or delete a frame from the library.
- Active frame metadata is returned with profiles, search results, friend results and room member data.
- Home/search/friends avatar UI supports overlay frames responsively.

### Calls
- TURN config is returned to WebRTC clients.
- `FORCE_TURN_RELAY=true` switches RTCPeerConnection to relay-only media transport.
- A TURN service and credentials are still required for relay-only calls.

### Telegram moderation archive
- Disabled by default.
- When explicitly enabled, a visible moderation/archive notice appears in the conversation UI.
- Telegram forum Topics are used per room when the target group supports them; otherwise messages fall back to the main Telegram chat.
- Text and supported media are organized with room/user/time information.
- New stored uploads up to `TELEGRAM_MAX_COPY_BYTES` are copied; larger uploads are represented by metadata.

## Intentional production constraint
The account's internal username remains stable in this build because current private-room IDs are constructed from usernames. The Settings page changes the public/display name. Renaming the internal username safely should be done only after private chats use stable database user IDs instead of username-derived room IDs.
## Avatar frame layering fix
- Profile photos now render above the centre of uploaded frame artwork, so the account image remains visible inside the frame.
- The same layering is used in Settings, the owner frame library preview, the main profile card, search results and friend lists.
- Frame artwork remains non-interactive and surrounds the circular account photo responsively.



## Avatar frame cutout v3
- إصلاح الإطارات التي تحتوي checkerboard مدمج داخل الصورة.
- قص دائري تلقائي وفتحة شفافة حقيقية في منتصف الإطار.
- صورة الحساب أصبحت طبقة مستقلة أعلى مركز الإطار ولا يمكن للإطار إخفاؤها.
- Cache busting لملفات CSS حتى يظهر الإصلاح فوراً أثناء الاختبار المحلي والنشر.

## WebRTC call reliability update
- Fixed two-way remote audio/video attachment with a dedicated remote MediaStream.
- Added microphone mute/unmute during calls.
- Added camera on/off during video calls.
- Audio calls can request upgrade to video; the other participant must accept.
- Added SDP renegotiation for audio-to-video upgrades and ICE restart support.
- URLs in text messages are now clickable and open safely.



## Cloudflare Realtime TURN integration
- Added authenticated `/api/turn-credentials` endpoint.
- Cloudflare long-lived TURN key stays only on the server.
- Browser receives short-lived ICE credentials immediately before calls.
- Added per-user server cache for TURN credentials and automatic client refresh.
- Filtered Cloudflare port 53 ICE URLs for browser reliability.
- `/api/health` now reports `turn: cloudflare`, `static`, or `stun-only`.
- Existing static TURN environment variables remain supported as a fallback.

## 2026-09-09 - Android/Samsung media picker stability
- Changed the chat media attachment option from images/audio to images/video only so Android can use its native photo/media picker instead of the generic document/audio provider chooser.
- Added `showPicker()` with a safe `.click()` fallback for native file selection.
- Removed the hard Socket.IO-connected precheck before uploading selected media.
- Media now uploads over HTTP first, then waits for Socket.IO to reconnect before publishing the message.
- Added automatic reconnect when returning from Android Gallery/photo picker (`visibilitychange`, `pageshow`, `focus`).
- Added one safe retry for temporary upload-network failures after returning from the picker.
- Kept the generic Files picker unchanged.

## 2026-09-11 — Room notifications + call device controls

- Added a per-room notification bell in the conversation header. Each user can mute/unmute every room independently and the preference is persisted in MongoDB state.
- Added Web Push subscriptions through a service worker so enabled-room notifications can arrive while TOMI is in the background or closed (where the browser/OS supports Web Push).
- Added push notifications for text messages, uploaded media/files, incoming private calls, and audio-to-video upgrade requests.
- Added an audio-output control during calls. Supporting browsers can choose/cycle speaker, earpiece, Bluetooth, or other audio outputs.
- Added front/rear camera switching during video calls using WebRTC track replacement without ending the call.
- Kept mute, camera on/off, audio-to-video upgrade, Cloudflare TURN, MongoDB/GridFS, and mobile upload fixes intact.

## 2026-09-11 — Calls, notifications, official platform broadcast, iPad layout
- Restored the original project color palette; new work is functional/layout-only.
- Per-room notification mute/unmute remains stored on the server and Web Push stays supported.
- Video calls now use a WhatsApp-like focus layout: tap remote/local video to swap large/small views.
- Added Picture-in-Picture call minimization where the browser/OS supports it, plus Media Session integration for better background-call handling.
- Improved audio routing by keeping remote audio on one dedicated audio element and using selectAudioOutput/setSinkId where browsers expose them; unsupported browsers fall back to the OS audio-route control without ending the call.
- Front/back camera switching remains available during video calls.
- Added owner-grantable `send_platform_broadcast` permission. Authorized staff can send one official TOMI message to every account; messages are persisted in each user's read-only “TOMI • حساب المنصة” conversation and also use Web Push when enabled.
- Improved iPad/tablet sidebar sizing with dynamic viewport/safe-area handling so Logout stays reachable above Safari browser chrome.

### Platform inbox cleanup
- Fixed duplicate `TOMI • حساب المنصة` entries in chat history.
- Legacy duplicate system rooms are automatically consolidated on startup.
- Future platform-wide announcements append to one official conversation per user.


## Voice rooms session fix
- Fixed the voice rooms page incorrectly treating a valid `/api/session` response as logged out.
- Voice rooms now wait for the Socket.IO connection before requesting the room list.
- Temporary network/server errors no longer force a logout; the page retries automatically.
- `/api/session` now also returns `authenticated: true` for backward compatibility.

## Render memory stability fix
- Reduced Socket.IO maximum inbound payload to 2 MB; files continue to use `/api/upload` streaming.
- Disabled large legacy Base64 media messages while preserving lightweight HTTPS sticker URLs.
- Added one-time migration of legacy Base64 chat media to MongoDB GridFS.
- Reworked MongoDB saves so only one state write can be active/pending, removing repeated full JSON clones.
- Reduced MongoDB pool size and serialized Telegram media copies; Telegram archive copies are capped at 4 MB by default (8 MB hard cap).
- Chat room joins now load the latest 300 messages instead of broadcasting an unbounded history in one Socket.IO payload.
- Added cleanup for expired sessions/TURN credential cache.
- `/api/health` now reports RSS/heap/external memory in MB.
- Start command uses a 384 MB V8 heap ceiling to leave room for native buffers inside a 512 MB Render instance.

## Voice rooms professional redesign + temporary exclusion
- Rebuilt the voice-room stage with an immersive professional live-room layout inspired by the supplied reference.
- Preserved live seats, room ownership, moderators, seat locking, force mute, seat removal, room code, image/name editing, WebRTC audio, Cloudflare TURN config, MongoDB/GridFS, and the prior Render memory protections.
- Added room sharing with direct `voice-rooms.html?room=...` links and auto-open on arrival.
- Added local listen/headphones control and cleaner member management sheets.
- Added owner-selected temporary room exclusion (1 minute to 7 days). Expired exclusions are removed automatically on the next join attempt.
- Room moderators still cannot demote or manage other moderators; room owner/platform owner retain role control.

## 2026-09-12 — Reliable media delivery fix
- Fixed videos/files getting stuck at 100% after upload.
- Chat media is now published in the same authenticated HTTP upload transaction instead of depending on a second Socket.IO step.
- Added idempotent media publishing so retries do not create duplicate messages.
- Kept Socket.IO publish as a compatibility fallback for already-open older clients.
- Added clearer upload states and server-side upload error logging.

## Media reliability and playback update
- Added a second Socket.IO delivery path for media through each participant's personal user room, preventing images/files from disappearing after brief mobile reconnects.
- Added upload idempotency by message ID so mobile retry does not duplicate messages.
- Added client/server media type hints and legacy MP4 metadata repair for Android gallery videos that were incorrectly stored as audio.
- Added HTTP HEAD, byte-range streaming, ETag/private browser caching, and bounded ephemeral local media cache in front of GridFS for smoother video/audio playback.
- Upload UI now shows real progress, transferred bytes, measured upload speed, ETA, and server-save phase.
- Added client upload queue (max 2 concurrent uploads) and captures the destination room at upload start so switching chats cannot misroute a file.

## 2026-09-12 - Voice notes, unread badges, pinned messages, screen sharing & background calls
- Added Telegram-style custom voice-note player with waveform, play/pause, seek and duration.
- New voice notes persist lightweight waveform/duration metadata with the chat message.
- Added per-conversation unread counters in the conversations window and in-room chat sidebar.
- Added message pin/unpin support with a pinned-message strip (up to 10 recent pinned messages per chat).
- Screen sharing now uses contain/full-frame rendering and signals screen-share state to the other peer so desktop/phone screens are not cropped.
- Audio calls can use an in-page floating mini window and, on browsers that support it, a synthetic Picture-in-Picture audio-call card for background browsing/apps.
- Preserved the existing 50-message retention, Memory Guard, GridFS media delivery, Cloudflare TURN, voice rooms and moderation features.
