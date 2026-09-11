# TOMI — New features setup

No new Render secrets are required beyond the Web Push settings already supported by this build.

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
- Removed the per-room browser notification button and disabled Web Push initialization.
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
