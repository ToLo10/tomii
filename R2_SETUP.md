# Cloudflare R2 setup for TOMI

This build sends every non-empty chat attachment (images, GIFs, videos, audio
and ordinary files) directly from the browser to Cloudflare R2 using multipart
uploads. Render handles login, permissions, upload authorization, chat metadata
and Socket.IO; it does not receive or spool the media bytes. MongoDB stores only
the small file/message metadata and the active multipart session state.

Keep `MONGODB_URI` configured as well for durable users, rooms, messages and R2
file metadata. R2 stores the media bytes; MongoDB stores the small record that
points to each object.

## 1. Create the bucket

In Cloudflare Dashboard, open **R2 Object Storage**, create a bucket such as
`tomi-media`, then create an R2 API token with **Object Read & Write** access to
that bucket. Copy the S3 Access Key ID and Secret Access Key once; the secret is
shown only when the token is created.

## 2. Add Render variables

Open the TOMI service in Render, then add these as **Environment variables**.
Do not put the secret values in GitHub or inside the ZIP file.

```text
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-s3-access-key
R2_SECRET_ACCESS_KEY=your-r2-s3-secret
R2_BUCKET=tomi-media
R2_PART_SIZE_BYTES=8388608
R2_PRESIGNED_UPLOAD_TTL_SECONDS=900
R2_PRESIGNED_DOWNLOAD_TTL_SECONDS=900
REQUIRE_EXTERNAL_MEDIA_STORAGE=true
REQUIRE_MONGODB=true
ALLOW_LOCAL_JSON_FALLBACK=false
# Optional: leave false unless the R2 bucket has browser CORS exposing ETag.
R2_DIRECT_BROWSER_UPLOAD=false
```

With `R2_DIRECT_BROWSER_UPLOAD=false`, images, videos, files, and voice notes
use the server's resumable upload route and are then streamed to R2. This is
the recommended setting for mobile clients because it avoids browser CORS and
multipart `ETag` failures. Set it to `true` only after configuring and testing
R2 bucket CORS.

`R2_ENDPOINT` is optional. Leave it unset unless you use a custom S3-compatible
endpoint; the app derives the normal endpoint from `R2_ACCOUNT_ID`.

## 3. Configure bucket CORS

In the bucket's **Settings → CORS policy**, add a policy using the exact public
origin of the TOMI service. Replace the placeholder below with your Render
URL, and add your local development origin only if you need it.

```json
[
  {
      "AllowedOrigins": [
      "https://YOUR-TOMI-SERVICE.onrender.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

`ETag` must be exposed because the browser uses it to finish each multipart
upload safely.

## 4. Restart and verify

Restart/redeploy the Render service after saving the variables. The startup
log should say:

```text
Files: Cloudflare R2 (direct browser upload, 8388608 byte parts)
```

Upload a test image and short video from a new browser session. New media
records have `storage: "r2"`; their `r2Key` is metadata only. The actual bytes
do not pass through Render during upload or playback. If the browser loses
connection, it retries the same R2 multipart part and resumes from the last
confirmed ETag. It never falls back to copying a complete file through Render.

The service keeps the old `/api/upload` and GridFS paths so existing records can
still be read and older non-chat tools remain compatible. New chat browser
uploads use direct R2 automatically when the variables above are present. If
R2 is temporarily unavailable in production, the upload is rejected and the
file is not written to Render as a hidden fallback.
Existing GridFS files are not deleted or moved automatically.

## Optional cleanup protection

Add an R2 lifecycle rule to abort incomplete multipart uploads after one day.
This removes abandoned uploads if a phone closes before pressing Complete.
