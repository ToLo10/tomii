"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function safeSegment(value, fallback = "unknown", maxLength = 100) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return cleaned || fallback;
}

function safeMimeType(value) {
  const mimeType = String(value || "application/octet-stream")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)
    ? mimeType
    : "application/octet-stream";
}

function safeDownloadName(value) {
  return String(value || "file")
    .replace(/[\u0000-\u001f\u007f"\\\r\n]/g, "_")
    .slice(0, 180) || "file";
}

function createObjectStorage() {
  const accountId = String(
    process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID || ""
  ).trim();
  const accessKeyId = String(
    process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || ""
  ).trim();
  const secretAccessKey = String(
    process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || ""
  ).trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();
  const endpoint = String(
    process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")
  ).trim();
  const configured = Boolean(accountId && accessKeyId && secretAccessKey && bucket && endpoint);
  const partSize = boundedInteger(
    process.env.R2_PART_SIZE_BYTES,
    8 * 1024 * 1024,
    5 * 1024 * 1024,
    64 * 1024 * 1024
  );
  const uploadUrlTtlSeconds = boundedInteger(
    process.env.R2_PRESIGNED_UPLOAD_TTL_SECONDS,
    15 * 60,
    60,
    60 * 60
  );
  const downloadUrlTtlSeconds = boundedInteger(
    process.env.R2_PRESIGNED_DOWNLOAD_TTL_SECONDS,
    15 * 60,
    60,
    60 * 60
  );

  const client = configured
    ? new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    })
    : null;

  function requireConfigured() {
    if (!configured || !client) {
      throw new Error("Cloudflare R2 is not configured");
    }
  }

  function buildObjectKey({ fileId, originalName, context = "chat", roomId = "", variant = "" } = {}) {
    const extension = path.extname(String(originalName || "")).toLowerCase();
    const safeExtension = /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : "";
    const safeVariant = variant ? `.${safeSegment(variant, "variant", 40)}` : "";
    return [
      "media",
      safeSegment(context, "chat", 32),
      safeSegment(roomId, "global", 100),
      `${safeSegment(fileId, "file", 100)}${safeVariant}${safeExtension}`
    ].join("/");
  }

  async function createMultipartUpload({ key, contentType, metadata = {} } = {}) {
    requireConfigured();
    const result = await client.send(new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: String(key),
      ContentType: safeMimeType(contentType),
      Metadata: Object.fromEntries(
        Object.entries(metadata || {})
          .map(([name, value]) => [safeSegment(name, "meta", 50).toLowerCase(), String(value).slice(0, 200)])
          .filter(([name]) => Boolean(name))
      )
    }));
    if (!result?.UploadId) throw new Error("R2 did not return a multipart upload id");
    return String(result.UploadId);
  }

  async function getSignedPartUploadUrl({ key, uploadId, partNumber } = {}) {
    requireConfigured();
    const part = Number(partNumber);
    if (!Number.isInteger(part) || part < 1 || part > 10000) {
      throw new Error("Invalid R2 multipart part number");
    }
    return getSignedUrl(client, new UploadPartCommand({
      Bucket: bucket,
      Key: String(key),
      UploadId: String(uploadId),
      PartNumber: part
    }), { expiresIn: uploadUrlTtlSeconds });
  }

  async function completeMultipartUpload({ key, uploadId, parts } = {}) {
    requireConfigured();
    const normalized = (Array.isArray(parts) ? parts : [])
      .map(part => ({
        PartNumber: Number(part?.partNumber ?? part?.PartNumber),
        ETag: String(part?.etag ?? part?.ETag ?? "").trim()
      }))
      .filter(part => Number.isInteger(part.PartNumber) && part.PartNumber >= 1 && part.PartNumber <= 10000 && part.ETag)
      .sort((a, b) => a.PartNumber - b.PartNumber);
    if (!normalized.length || normalized.some((part, index) => index > 0 && part.PartNumber === normalized[index - 1].PartNumber)) {
      throw new Error("R2 multipart parts are incomplete or duplicated");
    }
    const result = await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: String(key),
      UploadId: String(uploadId),
      MultipartUpload: { Parts: normalized }
    }));
    return { etag: result?.ETag ? String(result.ETag) : null, parts: normalized };
  }

  async function abortMultipartUpload({ key, uploadId } = {}) {
    if (!configured || !client || !key || !uploadId) return false;
    await client.send(new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: String(key),
      UploadId: String(uploadId)
    }));
    return true;
  }

  async function putFile({ key, filePath, contentType, metadata = {} } = {}) {
    requireConfigured();
    const stat = await fs.promises.stat(filePath);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: String(key),
      Body: fs.createReadStream(filePath),
      ContentLength: stat.size,
      ContentType: safeMimeType(contentType),
      Metadata: Object.fromEntries(
        Object.entries(metadata || {})
          .map(([name, value]) => [safeSegment(name, "meta", 50).toLowerCase(), String(value).slice(0, 200)])
          .filter(([name]) => Boolean(name))
      )
    }));
    return { size: stat.size };
  }

  async function downloadObjectToFile({ key, filePath } = {}) {
    requireConfigured();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: String(key) }));
    if (!result?.Body) throw new Error("R2 object has no response body");
    await pipeline(result.Body, fs.createWriteStream(filePath, { flags: "wx" }));
    return { size: Number(result.ContentLength || 0) || null };
  }

  async function readObjectBuffer({ key, maxBytes = 8 * 1024 * 1024 } = {}) {
    requireConfigured();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: String(key) }));
    if (!result?.Body) return null;
    const chunks = [];
    let total = 0;
    for await (const chunk of result.Body) {
      total += chunk.length;
      if (total > maxBytes) {
        result.Body.destroy?.();
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async function deleteObject({ key } = {}) {
    if (!configured || !client || !key) return false;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(key) }));
    return true;
  }

  async function headObject({ key } = {}) {
    requireConfigured();
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: String(key) }));
    return {
      size: Number(result?.ContentLength || 0) || 0,
      etag: result?.ETag ? String(result.ETag) : null,
      contentType: result?.ContentType ? String(result.ContentType) : null
    };
  }

  async function getSignedDownloadUrl({ key, mimeType, fileName, inline = true, cacheControl = "" } = {}) {
    requireConfigured();
    const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeDownloadName(fileName))}`;
    const commandInput = {
      Bucket: bucket,
      Key: String(key),
      ResponseContentType: safeMimeType(mimeType),
      ResponseContentDisposition: disposition
    };
    if (cacheControl) commandInput.ResponseCacheControl = String(cacheControl).slice(0, 300);
    return getSignedUrl(client, new GetObjectCommand(commandInput), { expiresIn: downloadUrlTtlSeconds });
  }

  return {
    isConfigured: () => configured,
    getConfigSummary: () => ({
      configured,
      provider: "cloudflare-r2",
      bucket: configured ? bucket : null,
      partSize,
      uploadUrlTtlSeconds,
      downloadUrlTtlSeconds
    }),
    getPartSize: () => partSize,
    buildObjectKey,
    createMultipartUpload,
    getSignedPartUploadUrl,
    completeMultipartUpload,
    abortMultipartUpload,
    putFile,
    downloadObjectToFile,
    readObjectBuffer,
    deleteObject,
    headObject,
    getSignedDownloadUrl
  };
}

module.exports = { createObjectStorage };
