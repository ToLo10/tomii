# TOMI — Notifications & Call Controls

This build adds:

- Per-room notification bell (saved per user/per room in MongoDB state).
- Web Push notifications for text, media/files, incoming private calls, and audio-to-video upgrade requests.
- Service worker support for background/closed-browser notifications where the browser/OS supports Web Push.
- Audio output button during calls (speaker/earpiece/Bluetooth selection where supported by the browser).
- Front/rear camera flip during video calls without ending the call.

## Deployment

Use `npm install` as the Render build command, then `npm start`.
The `web-push` dependency is included in `package.json`.

No extra VAPID environment variables are required: TOMI creates a VAPID key pair once and persists it in the MongoDB application state. Optional overrides are supported through `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.

After deployment, open `/api/health`. A healthy build should show `notifications: "web-push"` in addition to MongoDB/GridFS/TURN status.

## Browser notes

Camera flipping uses standard WebRTC camera constraints and track replacement. Audio output selection is limited by browser/OS capabilities. Supporting browsers show an audio-output picker or cycle available outputs; browsers that do not expose speaker/earpiece routing will tell the user to use the phone's system audio controls.
