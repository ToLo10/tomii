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
