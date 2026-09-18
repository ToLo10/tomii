# Cloudflare R2 setup for TOMI

This build sends large videos and audio directly from the browser to Cloudflare
R2. Images and ordinary attachments use the authenticated app upload path so a
missing bucket CORS/ETag rule cannot make photos fail. Northflank handles login,
permissions, chat metadata and Socket.IO; MongoDB/GridFS remains available for
older files already in the database.

Keep `MONGODB_URI` configured as well for durable users, rooms, messages and R2
file metadata. R2 stores the media bytes; MongoDB stores the small record that
points to each object.

## 1. Create the bucket

In Cloudflare Dashboard, open **R2 Object Storage**, create a bucket such as
`tomi-media`, then create an R2 API token with **Object Read & Write** access to
that bucket. Copy the S3 Access Key ID and Secret Access Key once; the secret is
shown only when the token is created.

## 2. Add Northflank variables

Open the `tomi` service in Northflank, then add these as **Runtime variables**.
Do not put the secret values in GitHub or inside the ZIP file.

```text
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-s3-access-key
R2_SECRET_ACCESS_KEY=your-r2-s3-secret
R2_BUCKET=tomi-media
R2_PART_SIZE_BYTES=8388608
R2_PRESIGNED_UPLOAD_TTL_SECONDS=900
R2_PRESIGNED_DOWNLOAD_TTL_SECONDS=900
```

`R2_ENDPOINT` is optional. Leave it unset unless you use a custom S3-compatible
endpoint; the app derives the normal endpoint from `R2_ACCOUNT_ID`.

## 3. Configure bucket CORS

In the bucket's **Settings → CORS policy**, add a policy using the exact public
origin of the TOMI service. Replace the placeholder below with your Northflank
URL, and add your local development origin only if you need it.

```json
[
  {
    "AllowedOrigins": [
      "https://YOUR-TOMI-SERVICE.code.run",
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

Restart/redeploy the Northflank service after saving the variables. The startup
log should say:

```text
Files: Cloudflare R2 (direct browser upload, 8388608 byte parts)
```

Upload a test image and short video from a new browser session. Images are
expected to use the authenticated server path. New direct video/audio records
have `storage: "r2"`; their `r2Key` is metadata only. The actual bytes do not
pass through Northflank during normal direct upload or playback. If the browser
cannot use the direct R2 path, the client automatically retries the video via
the resumable server path instead of leaving a failed message.

The service keeps the old `/api/upload` and GridFS paths for compatibility. New
browser uploads use the direct R2 path automatically when the variables above
are present. Existing GridFS files are not deleted or moved automatically.

## Optional cleanup protection

Add an R2 lifecycle rule to abort incomplete multipart uploads after one day.
This removes abandoned uploads if a phone closes before pressing Complete.
