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
