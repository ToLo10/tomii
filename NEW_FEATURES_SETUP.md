# TOMI — New features setup

The Web Push settings remain supported by this build. Animated stickers also
require `GIPHY_API_KEY` in Render Environment.

## GIPHY stickers

Set `GIPHY_API_KEY` to the GIPHY API key in Render > Environment, then redeploy.
The sticker picker uses `/api/giphy/search`, an authenticated and rate-limited
server proxy, while keeping the previous client configuration compatible.

## Notification toggle

The bell on the home page, chat, voice rooms, and settings is reversible:
pressing it subscribes or unsubscribes this browser/device from TOMI Web Push.
The browser's own `Notification.permission` cannot be changed by page code; if
the browser says notifications are blocked, allow them from the site settings
first and then press the bell again.

## Delegated avatar-frame management

The platform owner can grant the dedicated `manage_frames` permission to an
approved Admin/Moderator from the platform permissions editor. That moderator
can then open Settings and grant or remove existing frames from user accounts;
uploading and deleting frame files stays owner-only.

## Per-room notifications
Users can enable/mute each room from the bell button. Preferences are stored server-side. If Web Push is enabled, supported browsers can notify users in the background.

## Call controls
- Mute microphone
- Camera on/off
- Front/back camera switch
- Audio output selection where the browser supports `selectAudioOutput` / `setSinkId`
- Tap remote/local video to swap the large and thumbnail views
- Picture-in-Picture button for supported browsers

Mobile operating systems do not expose a universal web API that can force earpiece vs loudspeaker on every browser. When the browser blocks audio routing, TOMI keeps the call running and the user can change the route from the phone's system audio/Bluetooth controls.

## Official TOMI broadcast
The permission catalog now contains:

`send_platform_broadcast` — إرسال رسالة لجميع مستخدمي المنصة

The platform owner can grant/revoke this permission to an approved Admin/Moderator from the normal permissions editor. Authorized users then see the broadcast composer in the platform administration page.

Each recipient receives the announcement in a read-only conversation named `TOMI • حساب المنصة`, whether or not they are friends with the sender. Web Push is also attempted when the recipient has enabled notifications.


## Ordinary user option in owner account creator
- The owner account-creation panel now includes `مستخدم عادي (بدون صلاحيات)`.
- Normal users created here receive role `user`, no staff badge, `staffApproved: false`, and an empty permissions array.
- Permission checkboxes are automatically cleared/disabled when this role is selected.


## Latest call/chat UX update
- The device notification button can be switched on or off at any time.
- Active audio/video calls can be minimized inside TOMI and continue while switching between chats without reloading the page.
- Chat images open in a full-screen lightbox with a close button.

## Official TOMI inbox consolidation
- Each user now has exactly one canonical `TOMI • حساب المنصة` conversation.
- Every new owner/admin platform broadcast is appended to that same conversation.
- On server startup, legacy duplicate TOMI system conversations are merged into the canonical inbox, preserving message history and removing duplicate room cards.


## Floating call window controls
- Minimized audio and video calls can be dragged anywhere inside the viewport.
- The user can resize the floating call window with +/- buttons or the corner resize grip.
- The chosen size and position are remembered on the device and clamped back into view after orientation/viewport changes.
- Expanding the call restores the normal full call UI without interrupting WebRTC.

## تحديث 2026-09-12

- استمرار المكالمة عند تبديل المحادثات داخل room.html بدون إعادة تحميل.
- عند وجود مكالمة وفتح الرئيسية/البحث/الإعدادات يفتح TOMI الصفحة المطلوبة في تبويب آخر حتى يبقى تبويب WebRTC حياً.
- وضع خلفية للمكالمة + Picture-in-Picture للفيديو حيث يدعمه المتصفح.
- مشاركة الشاشة أثناء المكالمة عبر getDisplayMedia حيث يدعمه المتصفح.
- تسجيل الفويز صار يحتوي إلغاء وإرسال صريحين، مع اختيار MP4/AAC على Safari عند توفره وWebM/Opus كبديل.
- دعم HTTP Range لملفات GridFS والقرص لتحسين تشغيل الصوت والفيديو على Safari/iPhone/iPad.
- تثبيت تمرير المحادثة ومنع قفز القائمة عند ظهور/اختفاء لوحة المفاتيح أو تحميل الوسائط.
- زر القائمة الجانبية يبقى متاحاً داخل شاشة المحادثة على الهاتف.
- إضافة صفحة الغرف الصوتية العامة مع 8 مقاعد، رمز اختياري، صورة واسم، إدارة مقاعد، مشرفين، طرد وحظر خاص بالغرفة.
- مشرف الغرفة الصوتية لا يستطيع تنزيل مشرف آخر؛ مالك الغرفة ومالك المنصة فقط يديران رتب المشرفين.

### Voice room temporary kick
The room owner/platform owner can choose **طرد مؤقت بمدة** from a member's management sheet. The user is removed immediately and cannot re-enter until the selected duration expires. The maximum UI/server duration is 10080 minutes (7 days).


## Stability / retention update
- TOMI now keeps the newest 50 messages per conversation by default (`CHAT_HISTORY_LIMIT=50`).
- Old chat attachments that are no longer referenced are deleted from GridFS/local storage automatically.
- Abandoned chat uploads are cleaned after 6 hours.
- A memory guard runs every 30 seconds: warning at 300 MB RSS and cleanup at 340 MB. Controlled restart is disabled by default and requires both explicit opt-in and sustained Heap/external-buffer pressure.
- `/api/health` reports RSS/heap/heap-total/external/ArrayBuffer memory plus memory-guard status and restart thresholds.
- Node starts with `--expose-gc --max-old-space-size=320` to leave native-memory headroom inside a 512 MB Render instance.
- Large media remains HTTP/GridFS streamed; Socket.IO is for messaging/signaling, not raw large files.

### Recent chat/call additions
No new environment variables are required for these additions. After deploy, test voice-note recording, unread badges, pin/unpin, screen sharing from both landscape and portrait devices, and audio-call minimization/Picture-in-Picture on the target browsers.
