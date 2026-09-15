"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const LATENCY_BUCKETS = Object.freeze([
  ["lt50", 50],
  ["lt100", 100],
  ["lt250", 250],
  ["lt500", 500],
  ["lt1000", 1000],
  ["lt3000", 3000],
  ["gte3000", Infinity]
]);

const TRACKABLE_EVENTS = new Set([
  "page_view",
  "session_start",
  "heartbeat",
  "register",
  "login",
  "message_sent",
  "upload_started",
  "upload_complete",
  "upload_failed",
  "room_join",
  "call_start",
  "referral_click",
  "page_performance",
  "feature_use"
]);

const PERSISTED_EVENT_TYPES = new Set([
  "session_start",
  "page_view",
  "register",
  "login",
  "upload_complete",
  "upload_failed",
  "room_join",
  "call_start",
  "referral_click",
  "page_performance"
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dateOr(value, fallback = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date : new Date(fallback);
}

function hourStart(value) {
  const date = dateOr(value);
  date.setMinutes(0, 0, 0);
  return date;
}

function dayStart(value) {
  const date = dateOr(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketId(type, value) {
  return `${type}:${dateOr(value).toISOString()}`;
}

function hashIdentifier(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return crypto.createHash("sha256").update(clean).digest("hex").slice(0, 32);
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
}

function appendCookie(res, cookie) {
  const current = res.getHeader?.("Set-Cookie");
  const values = Array.isArray(current) ? current : current ? [current] : [];
  res.setHeader("Set-Cookie", [...values, cookie]);
}

function readCookie(req, name) {
  const header = String(req?.headers?.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch (_) { return ""; }
  }
  return "";
}

function sanitizeValue(value, depth = 0) {
  if (depth > 2) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 160);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(item => sanitizeValue(item, depth + 1)).filter(item => item !== undefined);
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 24)) {
      const safeKey = String(key).replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 48);
      if (!safeKey) continue;
      const safeValue = sanitizeValue(item, depth + 1);
      if (safeValue !== undefined) result[safeKey] = safeValue;
    }
    return result;
  }
  return undefined;
}

function parseUserAgent(userAgent = "") {
  const ua = String(userAgent || "");
  const deviceType = /ipad|tablet|android(?!.*mobile)/i.test(ua)
    ? "tablet"
    : /mobile|iphone|ipod|android/i.test(ua)
      ? "mobile"
      : "desktop";
  const osName = /android/i.test(ua)
    ? "Android"
    : /iphone|ipad|ipod/i.test(ua)
      ? "iOS"
      : /windows/i.test(ua)
        ? "Windows"
        : /macintosh|mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Other";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /firefox\//i.test(ua)
      ? "Firefox"
      : /chrome\//i.test(ua) && !/edg\//i.test(ua)
        ? "Chrome"
        : /safari\//i.test(ua) && !/chrome\//i.test(ua)
          ? "Safari"
          : /opr\//i.test(ua)
            ? "Opera"
            : "Other";
  return { deviceType, os: osName, browser };
}

function emptyLatencyBuckets() {
  return Object.fromEntries(LATENCY_BUCKETS.map(([key]) => [key, 0]));
}

function emptyBucket(type, start) {
  return {
    key: bucketId(type, start),
    bucketType: type,
    bucketStart: dateOr(start),
    uniqueVisitors: 0,
    sessions: 0,
    pageViews: 0,
    newUsers: 0,
    activeUsers: 0,
    peakOnline: 0,
    apiRequests: 0,
    apiErrors: 0,
    latencyCount: 0,
    totalLatencyMs: 0,
    latencyBuckets: emptyLatencyBuckets(),
    messagesSent: 0,
    uploadsStarted: 0,
    uploadsCompleted: 0,
    uploadsFailed: 0,
    uploadBytes: 0,
    roomJoins: 0,
    callsStarted: 0,
    referralClicks: 0,
    pageLoadCount: 0,
    totalPageLoadMs: 0,
    featureCounts: {}
  };
}

function normalizeBucket(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bucket = emptyBucket(source.bucketType || "hour", source.bucketStart || new Date());
  for (const key of Object.keys(bucket)) {
    if (["key", "bucketType", "bucketStart", "latencyBuckets", "featureCounts"].includes(key)) continue;
    if (typeof bucket[key] === "number") bucket[key] = Math.max(0, finiteNumber(source[key], bucket[key]));
  }
  bucket.key = String(source.key || bucket.key);
  bucket.bucketType = source.bucketType === "day" ? "day" : "hour";
  bucket.bucketStart = dateOr(source.bucketStart, bucket.bucketStart);
  bucket.latencyBuckets = { ...emptyLatencyBuckets(), ...(source.latencyBuckets || {}) };
  for (const key of Object.keys(bucket.latencyBuckets)) {
    bucket.latencyBuckets[key] = Math.max(0, finiteNumber(bucket.latencyBuckets[key]));
  }
  bucket.featureCounts = {};
  for (const [key, value] of Object.entries(source.featureCounts || {}).slice(0, 80)) {
    bucket.featureCounts[String(key).slice(0, 60)] = Math.max(0, finiteNumber(value));
  }
  return bucket;
}

function emptyUserStats(userId) {
  return {
    userId,
    firstSeenAt: null,
    lastSeenAt: null,
    sessions: 0,
    pageViews: 0,
    heartbeats: 0,
    activeMinutes: 0,
    messagesSent: 0,
    uploadsStarted: 0,
    uploadsCompleted: 0,
    uploadsFailed: 0,
    uploadBytes: 0,
    roomJoins: 0,
    callsStarted: 0,
    pageLoadCount: 0,
    totalPageLoadMs: 0,
    deviceCounts: {},
    featureCounts: {}
  };
}

function normalizeUserStats(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const user = emptyUserStats(String(source.userId || source._id || ""));
  for (const key of Object.keys(user)) {
    if (["userId", "firstSeenAt", "lastSeenAt", "deviceCounts", "featureCounts"].includes(key)) continue;
    user[key] = Math.max(0, finiteNumber(source[key], user[key]));
  }
  user.firstSeenAt = source.firstSeenAt ? dateOr(source.firstSeenAt).toISOString() : null;
  user.lastSeenAt = source.lastSeenAt ? dateOr(source.lastSeenAt).toISOString() : null;
  user.deviceCounts = {};
  for (const [key, value] of Object.entries(source.deviceCounts || {}).slice(0, 20)) {
    user.deviceCounts[String(key).slice(0, 40)] = Math.max(0, finiteNumber(value));
  }
  user.featureCounts = {};
  for (const [key, value] of Object.entries(source.featureCounts || {}).slice(0, 50)) {
    user.featureCounts[String(key).slice(0, 60)] = Math.max(0, finiteNumber(value));
  }
  return user;
}

function emptyReferral(code, ownerUserId = "") {
  return {
    code,
    ownerUserId,
    clicks: 0,
    uniqueClicks: 0,
    registrations: 0,
    activatedUsers: 0,
    lastClickAt: null,
    createdAt: new Date().toISOString(),
    uniqueVisitors: []
  };
}

function normalizeReferral(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = emptyReferral(normalizeCode(source.code), String(source.ownerUserId || ""));
  result.clicks = Math.max(0, finiteNumber(source.clicks));
  result.uniqueClicks = Math.max(0, finiteNumber(source.uniqueClicks));
  result.registrations = Math.max(0, finiteNumber(source.registrations));
  result.activatedUsers = Math.max(0, finiteNumber(source.activatedUsers));
  result.lastClickAt = source.lastClickAt ? dateOr(source.lastClickAt).toISOString() : null;
  result.createdAt = source.createdAt ? dateOr(source.createdAt).toISOString() : result.createdAt;
  result.uniqueVisitors = Array.isArray(source.uniqueVisitors)
    ? source.uniqueVisitors.map(String).slice(-5000)
    : [];
  return result;
}

function createAnalyticsService(options = {}) {
  const mongoose = options.mongoose || null;
  const localPath = options.localPath || path.join(process.cwd(), "analytics_database.json");
  const cloudEnabled = Boolean(options.cloudEnabled);
  const localBackupEnabled = options.localBackupEnabled !== false;
  const getUsers = typeof options.getUsers === "function" ? options.getUsers : () => ({});
  const getUser = typeof options.getUser === "function" ? options.getUser : username => getUsers()?.[username];
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const resolveUser = typeof options.resolveUser === "function" ? options.resolveUser : () => "";
  const ownerUsername = String(options.ownerUsername || "tomi");
  const nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : () => Date.now();

  const maxRawQueue = Math.max(500, Math.min(10000, finiteNumber(process.env.ANALYTICS_MAX_RAW_QUEUE, 3000)));
  const eventTtlSeconds = Math.max(
    DAY / 1000,
    finiteNumber(process.env.ANALYTICS_EVENT_TTL_DAYS, 90) * DAY / 1000
  );
  const flushIntervalMs = Math.max(5000, finiteNumber(process.env.ANALYTICS_FLUSH_INTERVAL_MS, 10000));
  const activeWindowMs = Math.max(60 * 1000, finiteNumber(process.env.ANALYTICS_ACTIVE_WINDOW_MS, 150000));
  const trackerLimit = Math.max(1000, Math.min(100000, finiteNumber(process.env.ANALYTICS_TRACKER_LIMIT, 50000)));

  const buckets = new Map();
  const users = new Map();
  const referrals = new Map();
  const visitorTrackers = new Map();
  const activeSessions = new Map();
  const connectedSockets = new Map();
  const systemSamples = [];
  const rawEventQueue = [];
  let analyticsModels = null;
  let flushTimer = null;
  let systemTimer = null;
  let cleanupTimer = null;
  let flushInFlight = null;
  let started = false;
  let runtimeProvider = () => ({});

  let localSnapshot = { rollups: {}, users: {}, referrals: {} };
  if (localBackupEnabled) {
    try {
      if (fs.existsSync(localPath)) {
        const parsed = JSON.parse(fs.readFileSync(localPath, "utf8"));
        if (parsed && typeof parsed === "object") localSnapshot = parsed;
      }
    } catch (error) {
      console.warn("Analytics local snapshot could not be loaded:", error.message);
    }
  }

  for (const raw of Object.values(localSnapshot.rollups || {})) {
    const bucket = normalizeBucket(raw);
    buckets.set(bucket.key, bucket);
  }
  for (const raw of Object.values(localSnapshot.users || {})) {
    const user = normalizeUserStats(raw);
    if (user.userId) users.set(user.userId, user);
  }
  for (const raw of Object.values(localSnapshot.referrals || {})) {
    const referral = normalizeReferral(raw);
    if (referral.code) referrals.set(referral.code, referral);
  }

  function getBucket(type, start) {
    const key = bucketId(type, start);
    if (!buckets.has(key)) buckets.set(key, emptyBucket(type, start));
    return buckets.get(key);
  }

  function getUserStats(userId) {
    const clean = String(userId || "").trim();
    if (!clean) return null;
    if (!users.has(clean)) users.set(clean, emptyUserStats(clean));
    return users.get(clean);
  }

  function getReferralByCode(code, ownerUserId = "") {
    const clean = normalizeCode(code);
    if (!clean) return null;
    if (!referrals.has(clean)) referrals.set(clean, emptyReferral(clean, ownerUserId));
    const result = referrals.get(clean);
    if (ownerUserId && !result.ownerUserId) result.ownerUserId = ownerUserId;
    return result;
  }

  function getAllUsers() {
    const source = getUsers() || {};
    return Object.values(source).filter(item => item && typeof item === "object");
  }

  function referralOwner(code) {
    const clean = normalizeCode(code);
    if (!clean) return null;
    const user = getAllUsers().find(item => normalizeCode(item.referralCode) === clean);
    if (user) return user;
    const record = referrals.get(clean);
    return record?.ownerUserId ? getUser(record.ownerUserId) : null;
  }

  function generateReferralCode(username) {
    const base = String(username || "user").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase() || "TOMI";
    let code = "";
    do {
      code = `${base}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    } while (referralOwner(code) || [...referrals.keys()].includes(code));
    return code;
  }

  function ensureReferralCode(username) {
    const user = getUser(username);
    if (!user || !username) return "";
    const existing = normalizeCode(user.referralCode);
    if (existing && (!referralOwner(existing) || referralOwner(existing)?.username === username)) {
      const record = getReferralByCode(existing, username);
      if (record && !record.ownerUserId) record.ownerUserId = username;
      return existing;
    }

    const code = generateReferralCode(username);
    user.referralCode = code;
    user.referralCodeCreatedAt = user.referralCodeCreatedAt || new Date(nowProvider()).toISOString();
    getReferralByCode(code, username);
    saveState(getUsers());
    return code;
  }

  function ensureAllReferralCodes() {
    let changed = false;
    for (const user of getAllUsers()) {
      if (!user.username) continue;
      const before = user.referralCode;
      const code = ensureReferralCodeWithoutSave(user.username);
      if (code && code !== before) changed = true;
    }
    if (changed) saveState(getUsers());
    return changed;
  }

  function ensureReferralCodeWithoutSave(username) {
    const user = getUser(username);
    if (!user || !username) return "";
    const existing = normalizeCode(user.referralCode);
    if (existing && (!referralOwner(existing) || referralOwner(existing)?.username === username)) {
      getReferralByCode(existing, username);
      return existing;
    }
    const code = generateReferralCode(username);
    user.referralCode = code;
    user.referralCodeCreatedAt = user.referralCodeCreatedAt || new Date(nowProvider()).toISOString();
    getReferralByCode(code, username);
    return code;
  }

  function activeUniqueCount() {
    const threshold = nowProvider() - activeWindowMs;
    const keys = new Set();
    for (const entry of activeSessions.values()) {
      if (entry.lastSeenAt < threshold) continue;
      keys.add(entry.userId || entry.visitorHash || entry.sessionId);
    }
    for (const [socketId, username] of connectedSockets.entries()) {
      if (socketId && username) keys.add(username);
    }
    return keys.size;
  }

  function activeSocketCount() {
    return connectedSockets.size;
  }

  function addTracker(map, key, value) {
    if (!key || !value) return false;
    if (!map.has(key)) map.set(key, new Set());
    const set = map.get(key);
    if (set.size >= trackerLimit && !set.has(value)) return false;
    const before = set.size;
    set.add(value);
    return set.size !== before;
  }

  function incrementFeature(target, feature) {
    const key = String(feature || "").trim().slice(0, 60);
    if (!key) return;
    target[key] = Math.min(100000000, finiteNumber(target[key]) + 1);
  }

  function incrementLatency(bucket, durationMs) {
    const duration = clamp(finiteNumber(durationMs), 0, 10 * 60 * 1000);
    bucket.latencyCount += 1;
    bucket.totalLatencyMs += duration;
    const match = LATENCY_BUCKETS.find(([, upper]) => duration < upper);
    bucket.latencyBuckets[match ? match[0] : "gte3000"] += 1;
  }

  function updateUserStats(type, payload, at) {
    const userId = String(payload.userId || "").trim();
    if (!userId) return;
    const user = getUserStats(userId);
    if (!user) return;
    const nowIso = at.toISOString();
    if (!user.firstSeenAt) user.firstSeenAt = nowIso;
    user.lastSeenAt = nowIso;

    const counterMap = {
      session_start: "sessions",
      page_view: "pageViews",
      heartbeat: "heartbeats",
      message_sent: "messagesSent",
      upload_started: "uploadsStarted",
      upload_complete: "uploadsCompleted",
      upload_failed: "uploadsFailed",
      room_join: "roomJoins",
      call_start: "callsStarted"
    };
    if (counterMap[type]) user[counterMap[type]] += 1;
    if (type === "heartbeat") user.activeMinutes += 0.75;
    if (type === "upload_complete") user.uploadBytes += Math.max(0, finiteNumber(payload.bytes));
    if (type === "page_performance") {
      user.pageLoadCount += 1;
      user.totalPageLoadMs += Math.max(0, finiteNumber(payload.loadMs));
    }
    if (type === "feature_use") incrementFeature(user.featureCounts, payload.feature);

    const device = payload.deviceType || payload.device;
    if (device) user.deviceCounts[String(device).slice(0, 40)] = finiteNumber(user.deviceCounts[String(device).slice(0, 40)]) + 1;
  }

  function attributeRegistration(username, refCode, at) {
    const code = normalizeCode(refCode);
    if (!username || !code) return false;
    const owner = referralOwner(code);
    if (!owner || owner.username === username) return false;
    const user = getUser(username);
    if (!user || user.referredBy) return false;
    user.referredBy = owner.username;
    user.referralCodeUsed = code;
    user.referralAttributedAt = at.toISOString();
    const referral = getReferralByCode(code, owner.username);
    referral.registrations += 1;
    saveState(getUsers());
    return true;
  }

  function track(type, payload = {}) {
    if (!TRACKABLE_EVENTS.has(type)) return false;
    const at = dateOr(payload.at, new Date(nowProvider()));
    const visitorHash = payload.visitorHash || hashIdentifier(payload.visitorId || payload.visitor || "");
    const userId = String(payload.userId || "").trim().slice(0, 80);
    const sessionId = String(payload.sessionId || "").trim().slice(0, 120);
    const refCode = normalizeCode(payload.refCode || payload.referralCode || "");
    const safePayload = {
      ...payload,
      userId,
      sessionId,
      visitorHash,
      refCode,
      at: at.toISOString()
    };

    const hour = getBucket("hour", hourStart(at));
    const day = getBucket("day", dayStart(at));
    const targets = [hour, day];

    for (const bucket of targets) {
      if (type === "page_view") bucket.pageViews += 1;
      if (type === "session_start") bucket.sessions += 1;
      if (type === "register") bucket.newUsers += 1;
      if (type === "message_sent") bucket.messagesSent += 1;
      if (type === "upload_started") bucket.uploadsStarted += 1;
      if (type === "upload_complete") {
        bucket.uploadsCompleted += 1;
        bucket.uploadBytes += Math.max(0, finiteNumber(payload.bytes));
      }
      if (type === "upload_failed") bucket.uploadsFailed += 1;
      if (type === "room_join") bucket.roomJoins += 1;
      if (type === "call_start") bucket.callsStarted += 1;
      if (type === "referral_click") bucket.referralClicks += 1;
      if (type === "page_performance") {
        bucket.pageLoadCount += 1;
        bucket.totalPageLoadMs += Math.max(0, finiteNumber(payload.loadMs));
      }
      if (type === "feature_use") incrementFeature(bucket.featureCounts, payload.feature);
      if (type === "heartbeat") {
        const activityKey = userId || visitorHash || sessionId;
        if (activityKey) {
          const trackerKey = `${bucket.key}:active`;
          if (addTracker(visitorTrackers, trackerKey, activityKey)) bucket.activeUsers += 1;
        }
        bucket.peakOnline = Math.max(bucket.peakOnline, activeUniqueCount());
      }
      if (visitorHash && ["session_start", "page_view", "referral_click"].includes(type)) {
        const trackerKey = `${bucket.key}:visitors`;
        if (addTracker(visitorTrackers, trackerKey, visitorHash)) bucket.uniqueVisitors += 1;
      }
    }

    if (type === "heartbeat" && (sessionId || visitorHash || userId)) {
      activeSessions.set(sessionId || visitorHash || userId, {
        sessionId,
        userId,
        visitorHash,
        page: String(payload.page || "").slice(0, 120),
        roomId: String(payload.roomId || "").slice(0, 120),
        lastSeenAt: at.getTime()
      });
    }

    if (type === "register") {
      ensureReferralCodeWithoutSave(userId);
      attributeRegistration(userId, refCode, at);
    }
    if (type === "referral_click" && refCode) {
      const referral = getReferralByCode(refCode, referralOwner(refCode)?.username || "");
      referral.clicks += 1;
      referral.lastClickAt = at.toISOString();
      const persistentKey = `${dayStart(at).toISOString()}|${visitorHash}`;
      if (visitorHash && !referral.uniqueVisitors.includes(persistentKey)) {
        referral.uniqueVisitors.push(persistentKey);
        if (referral.uniqueVisitors.length > 5000) referral.uniqueVisitors = referral.uniqueVisitors.slice(-5000);
        referral.uniqueClicks += 1;
      }
    }

    updateUserStats(type, { ...payload, userId, visitorHash }, at);

    if (PERSISTED_EVENT_TYPES.has(type)) {
      rawEventQueue.push({
        eventType: type,
        userId: userId || null,
        visitorHash: visitorHash || null,
        sessionId: sessionId || null,
        page: String(payload.page || "").slice(0, 160),
        roomId: String(payload.roomId || "").slice(0, 120),
        refCode: refCode || null,
        metadata: sanitizeValue(payload.metadata || {
          deviceType: payload.deviceType || "",
          browser: payload.browser || "",
          os: payload.os || "",
          status: payload.status,
          loadMs: payload.loadMs,
          bytes: payload.bytes
        }),
        createdAt: at
      });
      if (rawEventQueue.length > maxRawQueue) rawEventQueue.splice(0, rawEventQueue.length - maxRawQueue);
    }
    return true;
  }

  function recordHttpRequest({ req, statusCode = 200, durationMs = 0, userId = "" } = {}) {
    const at = new Date(nowProvider());
    const pathName = String(req?.path || req?.originalUrl || req?.url || "").split("?")[0].slice(0, 160);
    const hour = getBucket("hour", hourStart(at));
    const day = getBucket("day", dayStart(at));
    for (const bucket of [hour, day]) {
      bucket.apiRequests += 1;
      if (Number(statusCode) >= 500) bucket.apiErrors += 1;
      incrementLatency(bucket, durationMs);
    }
    if (pathName.endsWith(".html") || pathName === "/" || pathName === "/index.html") {
      const page = pathName === "/" ? "/index.html" : pathName;
      track("page_view", {
        userId,
        visitorId: req?.analytics?.visitorId,
        sessionId: req?.analytics?.sessionId,
        page,
        deviceType: req?.analytics?.device?.deviceType,
        browser: req?.analytics?.device?.browser,
        os: req?.analytics?.device?.os,
        refCode: req?.analytics?.refCode
      });
      if (req?.analytics?.newSession) {
        track("session_start", {
          userId,
          visitorId: req?.analytics?.visitorId,
          sessionId: req?.analytics?.sessionId,
          page,
          deviceType: req?.analytics?.device?.deviceType,
          browser: req?.analytics?.device?.browser,
          os: req?.analytics?.device?.os,
          refCode: req?.analytics?.refCode
        });
      }
    }
    return { path: pathName, durationMs };
  }

  function httpMiddleware(req, res, next) {
    const startedAt = process.hrtime.bigint();
    const existingVisitor = readCookie(req, "tomi_vid");
    const existingSession = readCookie(req, "tomi_sid");
    const visitorId = existingVisitor || crypto.randomBytes(16).toString("hex");
    const sessionId = existingSession || crypto.randomBytes(18).toString("hex");
    const refCode = normalizeCode(readCookie(req, "tomi_ref") || req.query?.ref || "");
    const isNewSession = !existingSession;
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    if (!existingVisitor) appendCookie(res, `tomi_vid=${encodeURIComponent(visitorId)}; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
    if (!existingSession) appendCookie(res, `tomi_sid=${encodeURIComponent(sessionId)}; SameSite=Lax; Path=/; Max-Age=1800${secure}`);
    req.analytics = {
      visitorId,
      sessionId,
      refCode,
      newSession: isNewSession,
      device: parseUserAgent(req.headers["user-agent"] || "")
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      let userId = req.authUser || "";
      if (!userId) {
        try { userId = String(resolveUser(req) || ""); } catch (_) { userId = ""; }
      }
      recordHttpRequest({ req, statusCode: res.statusCode, durationMs, userId });
    };
    res.once("finish", finish);
    res.once("close", finish);
    next();
  }

  function captureReferral(req, res, code) {
    const clean = normalizeCode(code);
    const owner = referralOwner(clean);
    if (!clean || !owner) return false;
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    appendCookie(res, `tomi_ref=${encodeURIComponent(clean)}; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
    track("referral_click", {
      refCode: clean,
      visitorId: req?.analytics?.visitorId,
      sessionId: req?.analytics?.sessionId,
      page: "/r/" + clean,
      deviceType: req?.analytics?.device?.deviceType,
      browser: req?.analytics?.device?.browser,
      os: req?.analytics?.device?.os
    });
    return true;
  }

  function clearReferralCookie(res) {
    appendCookie(res, "tomi_ref=; SameSite=Lax; Path=/; Max-Age=0");
  }

  function heartbeat(payload = {}, req = null) {
    const userId = String(payload.userId || resolveUser(req) || "").trim().slice(0, 80);
    const visitorId = payload.visitorId || req?.analytics?.visitorId || readCookie(req, "tomi_vid");
    const sessionId = payload.sessionId || req?.analytics?.sessionId || readCookie(req, "tomi_sid");
    track("heartbeat", {
      ...payload,
      userId,
      visitorId,
      sessionId,
      page: String(payload.page || req?.path || "").slice(0, 120),
      roomId: String(payload.roomId || "").slice(0, 120),
      deviceType: req?.analytics?.device?.deviceType || payload.deviceType
    });
    return {
      activeNow: activeUniqueCount(),
      activeSockets: activeSocketCount(),
      sessionId,
      visitorId
    };
  }

  function socketConnected(socketId, username = "") {
    if (!socketId) return;
    connectedSockets.set(String(socketId), String(username || ""));
    if (username) heartbeat({ userId: username, page: "socket" });
  }

  function socketDisconnected(socketId) {
    if (!socketId) return;
    connectedSockets.delete(String(socketId));
  }

  function setRuntimeProvider(provider) {
    runtimeProvider = typeof provider === "function" ? provider : () => ({});
  }

  function latencyPercentile(bucket, percentile = 0.95) {
    const total = Math.max(0, finiteNumber(bucket?.latencyCount));
    if (!total) return 0;
    const target = Math.max(1, Math.ceil(total * percentile));
    let cumulative = 0;
    for (const [key, upper] of LATENCY_BUCKETS) {
      cumulative += finiteNumber(bucket.latencyBuckets?.[key]);
      if (cumulative >= target) return Number.isFinite(upper) ? upper : 3000;
    }
    return 3000;
  }

  function flattenBucket(bucket) {
    const output = { ...bucket };
    output.bucketStart = dateOr(bucket.bucketStart).toISOString();
    output.averageLatencyMs = bucket.latencyCount ? bucket.totalLatencyMs / bucket.latencyCount : 0;
    output.p95LatencyMs = latencyPercentile(bucket, 0.95);
    output.averagePageLoadMs = bucket.pageLoadCount ? bucket.totalPageLoadMs / bucket.pageLoadCount : 0;
    delete output._id;
    return output;
  }

  function mergeBucketMaps(primary, secondary) {
    const result = new Map(primary);
    for (const [key, value] of secondary) if (!result.has(key)) result.set(key, value);
    return result;
  }

  async function queryRollups(from, to) {
    const start = dateOr(from, new Date(Date.now() - 2 * DAY));
    const end = dateOr(to, new Date());
    const memory = new Map();
    for (const [key, bucket] of buckets.entries()) {
      const at = dateOr(bucket.bucketStart);
      if (at >= start && at <= end) memory.set(key, bucket);
    }

    if (analyticsModels?.Rollup) {
      try {
        const remote = await analyticsModels.Rollup.find({ bucketStart: { $gte: start, $lte: end } }).lean().exec();
        for (const raw of remote || []) {
          const bucket = normalizeBucket(raw);
          if (!memory.has(bucket.key)) memory.set(bucket.key, bucket);
        }
      } catch (error) {
        console.warn("Analytics rollup query failed:", error.message);
      }
    }
    return [...memory.values()].sort((a, b) => dateOr(a.bucketStart) - dateOr(b.bucketStart));
  }

  async function countUniqueVisitors(from, to) {
    const start = dateOr(from, new Date(Date.now() - DAY));
    const end = dateOr(to, new Date());
    if (analyticsModels?.Event) {
      try {
        const values = await analyticsModels.Event.distinct("visitorHash", {
          eventType: "session_start",
          visitorHash: { $nin: [null, ""] },
          createdAt: { $gte: start, $lte: end }
        }).exec();
        if (values.length) return values.length;
      } catch (error) {
        console.warn("Analytics unique visitor query failed:", error.message);
      }
    }
    const values = new Set();
    for (const [key, set] of visitorTrackers.entries()) {
      if (!key.endsWith(":visitors")) continue;
      const bucketDate = key.split(":")[1];
      if (bucketDate && dateOr(bucketDate) >= start && dateOr(bucketDate) <= end) {
        for (const value of set) values.add(value);
      }
    }
    return values.size;
  }

  function sumBuckets(items) {
    const total = emptyBucket("range", new Date(0));
    total.bucketStart = new Date(0);
    for (const item of items) {
      for (const key of [
        "uniqueVisitors", "sessions", "pageViews", "newUsers", "activeUsers", "apiRequests", "apiErrors",
        "latencyCount", "totalLatencyMs", "messagesSent", "uploadsStarted", "uploadsCompleted", "uploadsFailed",
        "uploadBytes", "roomJoins", "callsStarted", "referralClicks", "pageLoadCount", "totalPageLoadMs"
      ]) total[key] += finiteNumber(item[key]);
      total.peakOnline = Math.max(total.peakOnline, finiteNumber(item.peakOnline));
      for (const [key, value] of Object.entries(item.featureCounts || {})) total.featureCounts[key] = finiteNumber(total.featureCounts[key]) + finiteNumber(value);
      for (const key of Object.keys(total.latencyBuckets)) total.latencyBuckets[key] += finiteNumber(item.latencyBuckets?.[key]);
    }
    return total;
  }

  async function getOverview({ from, to } = {}) {
    const end = dateOr(to, new Date());
    const start = dateOr(from, new Date(end.getTime() - DAY));
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const [items, previousItems, uniqueVisitors] = await Promise.all([
      queryRollups(start, end),
      queryRollups(previousStart, start),
      countUniqueVisitors(start, end)
    ]);
    const total = sumBuckets(items);
    const previous = sumBuckets(previousItems);
    const registeredUsers = getAllUsers().length;
    const uploadAttempts = total.uploadsCompleted + total.uploadsFailed;
    const averageLatencyMs = total.latencyCount ? total.totalLatencyMs / total.latencyCount : 0;
    const averagePageLoadMs = total.pageLoadCount ? total.totalPageLoadMs / total.pageLoadCount : 0;
    const growth = (current, old) => old ? ((current - old) / old) * 100 : current ? 100 : 0;
    const runtime = runtimeProvider() || {};
    const latestSystem = systemSamples.at(-1) || await getLatestSystemSample();

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      visitors: uniqueVisitors || total.uniqueVisitors,
      sessions: total.sessions,
      pageViews: total.pageViews,
      registeredUsers,
      newUsers: total.newUsers,
      activeNow: activeUniqueCount(),
      activeSockets: activeSocketCount(),
      peakOnline: total.peakOnline,
      averageLatencyMs: Math.round(averageLatencyMs),
      p95LatencyMs: latencyPercentile(total),
      averagePageLoadMs: Math.round(averagePageLoadMs),
      apiRequests: total.apiRequests,
      apiErrors: total.apiErrors,
      errorRate: total.apiRequests ? (total.apiErrors / total.apiRequests) * 100 : 0,
      messagesSent: total.messagesSent,
      uploadsStarted: total.uploadsStarted,
      uploadsCompleted: total.uploadsCompleted,
      uploadsFailed: total.uploadsFailed,
      uploadBytes: total.uploadBytes,
      uploadSuccessRate: uploadAttempts ? (total.uploadsCompleted / uploadAttempts) * 100 : 0,
      roomJoins: total.roomJoins,
      callsStarted: total.callsStarted,
      referralClicks: total.referralClicks,
      topFeatures: Object.entries(total.featureCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
      growth: {
        visitors: growth(uniqueVisitors || total.uniqueVisitors, previous.uniqueVisitors),
        newUsers: growth(total.newUsers, previous.newUsers),
        sessions: growth(total.sessions, previous.sessions),
        apiErrors: growth(total.apiErrors, previous.apiErrors)
      },
      memory: latestSystem ? latestSystem.memory : null,
      system: latestSystem,
      runtime
    };
  }

  async function getTimeseries({ from, to } = {}) {
    const end = dateOr(to, new Date());
    const start = dateOr(from, new Date(end.getTime() - DAY));
    const items = await queryRollups(start, end);
    const bucketType = end.getTime() - start.getTime() > 3 * DAY ? "day" : "hour";
    return items.filter(item => item.bucketType === bucketType).map(flattenBucket);
  }

  async function getSystemSeries({ from, to } = {}) {
    const end = dateOr(to, new Date());
    const start = dateOr(from, new Date(end.getTime() - DAY));
    let result = systemSamples.filter(item => dateOr(item.at) >= start && dateOr(item.at) <= end);
    if (analyticsModels?.System) {
      try {
        const remote = await analyticsModels.System.find({ at: { $gte: start, $lte: end } }).sort({ at: 1 }).lean().exec();
        if (remote?.length) result = remote;
      } catch (error) {
        console.warn("Analytics system series query failed:", error.message);
      }
    }
    return result;
  }

  async function getLatestSystemSample() {
    if (analyticsModels?.System) {
      try {
        return await analyticsModels.System.findOne().sort({ at: -1 }).lean().exec();
      } catch (_) {}
    }
    return systemSamples.at(-1) || null;
  }

  function userPublicStats(user) {
    const username = String(user?.username || "");
    const stats = normalizeUserStats(users.get(username) || { userId: username });
    return {
      username,
      displayName: user?.displayName || username,
      role: user?.role || "user",
      registeredAt: user?.registeredAt || null,
      lastSeen: user?.lastSeen || stats.lastSeenAt,
      status: user?.status || "offline",
      referralCode: normalizeCode(user?.referralCode),
      referredBy: user?.referredBy || null,
      stats: {
        ...stats,
        averagePageLoadMs: stats.pageLoadCount ? stats.totalPageLoadMs / stats.pageLoadCount : 0
      }
    };
  }

  async function getUsersStats({ query = "", limit = 100 } = {}) {
    const cleanQuery = String(query || "").trim().toLowerCase();
    const max = clamp(finiteNumber(limit, 100), 1, 500);
    const list = getAllUsers()
      .map(userPublicStats)
      .filter(item => !cleanQuery || item.username.toLowerCase().includes(cleanQuery) || item.displayName.toLowerCase().includes(cleanQuery))
      .sort((a, b) => {
        const left = Date.parse(a.lastSeen || a.registeredAt || 0) || 0;
        const right = Date.parse(b.lastSeen || b.registeredAt || 0) || 0;
        return right - left;
      })
      .slice(0, max);
    return { total: getAllUsers().length, users: list };
  }

  function buildReferralStats() {
    ensureAllReferralCodes();
    const byCode = new Map(referrals);
    for (const user of getAllUsers()) {
      const code = normalizeCode(user.referralCode);
      if (!code) continue;
      if (!byCode.has(code)) byCode.set(code, emptyReferral(code, user.username));
      const record = byCode.get(code);
      record.ownerUserId = user.username;
    }
    return [...byCode.values()]
      .map(record => ({
        code: record.code,
        ownerUserId: record.ownerUserId,
        clicks: record.clicks,
        uniqueClicks: record.uniqueClicks,
        registrations: record.registrations,
        activatedUsers: record.activatedUsers,
        conversionRate: record.clicks ? (record.registrations / record.clicks) * 100 : 0,
        lastClickAt: record.lastClickAt,
        link: `/r/${encodeURIComponent(record.code)}`
      }))
      .sort((a, b) => b.registrations - a.registrations || b.clicks - a.clicks);
  }

  async function getReferrals({ query = "" } = {}) {
    const cleanQuery = String(query || "").trim().toLowerCase();
    const rows = buildReferralStats().filter(item => !cleanQuery || item.code.toLowerCase().includes(cleanQuery) || String(item.ownerUserId).toLowerCase().includes(cleanQuery));
    return { total: rows.length, referrals: rows };
  }

  function referralForUser(username) {
    const user = getUser(username);
    if (!user) return null;
    const code = ensureReferralCode(username);
    const record = getReferralByCode(code, username);
    const stats = record || emptyReferral(code, username);
    return {
      code,
      link: `/r/${encodeURIComponent(code)}`,
      clicks: stats.clicks,
      uniqueClicks: stats.uniqueClicks,
      registrations: stats.registrations,
      activatedUsers: stats.activatedUsers,
      conversionRate: stats.clicks ? (stats.registrations / stats.clicks) * 100 : 0
    };
  }

  async function buildAiSummary({ from, to } = {}) {
    const end = dateOr(to, new Date());
    const start = dateOr(from, new Date(end.getTime() - DAY));
    const overview = await getOverview({ from: start, to: end });
    const timeseries = await getTimeseries({ from: start, to: end });
    const alerts = [];
    const insights = [];
    if (overview.errorRate >= 5) alerts.push(`نسبة أخطاء الخادم مرتفعة ووصلت إلى ${overview.errorRate.toFixed(1)}%`);
    if (overview.p95LatencyMs >= 1000) alerts.push(`زمن استجابة 95% من الطلبات يقارب ${overview.p95LatencyMs}ms`);
    if (overview.uploadSuccessRate > 0 && overview.uploadSuccessRate < 95) alerts.push(`نجاح رفع الملفات ${overview.uploadSuccessRate.toFixed(1)}% فقط`);
    if (overview.memory?.rssMB >= overview.memory?.warnAtMB) alerts.push(`استهلاك RSS مرتفع: ${overview.memory.rssMB}MB`);
    if (overview.activeNow > 0) insights.push(`يوجد حالياً ${overview.activeNow} مستخدم نشط تقريباً`);
    if (overview.newUsers > 0) insights.push(`تم تسجيل ${overview.newUsers} مستخدم جديد خلال الفترة`);
    if (overview.referralClicks > 0) insights.push(`تم تسجيل ${overview.referralClicks} زيارة من روابط الإحالة`);
    const peak = timeseries.reduce((best, item) => item.peakOnline > (best?.peakOnline || 0) ? item : best, null);
    if (peak) insights.push(`أعلى نشاط مسجل كان ${peak.peakOnline} مستخدم متصل تقريباً عند ${new Date(peak.bucketStart).toLocaleString("ar-IQ")}`);
    if (!alerts.length) alerts.push("لا توجد مؤشرات حرجة في الفترة المحددة حسب البيانات المتوفرة");
    return {
      mode: "local-analytics",
      generatedAt: new Date(nowProvider()).toISOString(),
      period: { from: start.toISOString(), to: end.toISOString() },
      summary: insights.join(". ") || "لا توجد بيانات كافية بعد للتحليل.",
      alerts,
      disclaimer: "هذا تحليل آلي مبني على المؤشرات المجمعة، ولا يثبت سبب المشكلة بدون فحص سجلات التطبيق بالتفصيل."
    };
  }

  function collectSystemSample() {
    const memory = process.memoryUsage();
    const eventLoop = eventLoopMonitor;
    const sample = {
      at: new Date(nowProvider()),
      memory: {
        rssMB: Math.round(memory.rss / 1024 / 1024),
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        externalMB: Math.round(memory.external / 1024 / 1024),
        arrayBuffersMB: Math.round((memory.arrayBuffers || 0) / 1024 / 1024),
        warnAtMB: Math.max(1, finiteNumber(process.env.MEMORY_WARN_MB, 300)),
        criticalAtMB: Math.max(1, finiteNumber(process.env.MEMORY_CRITICAL_MB, 440))
      },
      load: (os.loadavg?.() || [0, 0, 0]).slice(0, 3).map(value => Number(finiteNumber(value).toFixed(2))),
      eventLoopLagMs: Number((finiteNumber(eventLoop.mean) / 1e6).toFixed(2)),
      eventLoopMaxLagMs: Number((finiteNumber(eventLoop.max) / 1e6).toFixed(2)),
      activeUsers: activeUniqueCount(),
      activeSockets: activeSocketCount(),
      runtime: sanitizeValue(runtimeProvider() || {})
    };
    eventLoop.reset();
    systemSamples.push(sample);
    while (systemSamples.length > 7 * 24 * 60) systemSamples.shift();
    if (analyticsModels?.System) {
      analyticsModels.System.create(sample).catch(error => console.warn("Analytics system sample save failed:", error.message));
    }
    return sample;
  }

  function pruneRuntime() {
    const threshold = nowProvider() - Math.max(activeWindowMs * 4, 10 * MINUTE);
    for (const [key, entry] of activeSessions.entries()) {
      if (entry.lastSeenAt < threshold) activeSessions.delete(key);
    }
    for (const [key, set] of visitorTrackers.entries()) {
      const marker = key.split(":")[1];
      if (marker && dateOr(marker).getTime() < Date.now() - 3 * DAY) visitorTrackers.delete(key);
      else if (set.size > trackerLimit) visitorTrackers.set(key, new Set([...set].slice(-trackerLimit)));
    }
    for (const [key, bucket] of buckets.entries()) {
      if (dateOr(bucket.bucketStart).getTime() < Date.now() - 120 * DAY) buckets.delete(key);
    }
  }

  async function flush() {
    if (flushInFlight) return flushInFlight;
    flushInFlight = (async () => {
      const events = rawEventQueue.splice(0, rawEventQueue.length);
      try {
        if (analyticsModels?.Event && events.length) {
          await analyticsModels.Event.insertMany(events, { ordered: false }).catch(error => {
            console.warn("Analytics event batch save failed:", error.message);
          });
        }
        if (analyticsModels?.Rollup && buckets.size) {
          const operations = [...buckets.values()].map(bucket => ({
            updateOne: {
              filter: { key: bucket.key },
              update: { $set: { ...bucket, bucketStart: dateOr(bucket.bucketStart) } },
              upsert: true
            }
          }));
          await analyticsModels.Rollup.bulkWrite(operations, { ordered: false }).catch(error => {
            console.warn("Analytics rollup save failed:", error.message);
          });
        }
        if (analyticsModels?.User && users.size) {
          const operations = [...users.values()].map(user => ({
            updateOne: {
              filter: { userId: user.userId },
              update: { $set: user },
              upsert: true
            }
          }));
          await analyticsModels.User.bulkWrite(operations, { ordered: false }).catch(error => {
            console.warn("Analytics user stats save failed:", error.message);
          });
        }
        if (analyticsModels?.Referral && referrals.size) {
          const operations = [...referrals.values()].map(referral => ({
            updateOne: {
              filter: { code: referral.code },
              update: { $set: { ...referral, uniqueVisitors: referral.uniqueVisitors.slice(-5000) } },
              upsert: true
            }
          }));
          await analyticsModels.Referral.bulkWrite(operations, { ordered: false }).catch(error => {
            console.warn("Analytics referral save failed:", error.message);
          });
        }
        if (localBackupEnabled && (!cloudEnabled || !analyticsModels)) {
          const snapshot = {
            updatedAt: new Date(nowProvider()).toISOString(),
            rollups: Object.fromEntries([...buckets.entries()].map(([key, value]) => [key, flattenBucket(value)])),
            users: Object.fromEntries([...users.entries()].map(([key, value]) => [key, value])),
            referrals: Object.fromEntries([...referrals.entries()].map(([key, value]) => [key, { ...value, uniqueVisitors: value.uniqueVisitors.slice(-5000) }]))
          };
          await fs.promises.mkdir(path.dirname(localPath), { recursive: true }).catch(() => {});
          await fs.promises.writeFile(localPath, JSON.stringify(snapshot), "utf8").catch(error => {
            console.warn("Analytics local snapshot save failed:", error.message);
          });
        }
      } finally {
        flushInFlight = null;
      }
    })();
    return flushInFlight;
  }

  async function configureMongo() {
    if (!mongoose || mongoose.connection?.readyState !== 1) return false;
    try {
      const eventSchema = new mongoose.Schema({
        eventType: { type: String, index: true },
        userId: { type: String, index: true, default: null },
        visitorHash: { type: String, index: true, default: null },
        sessionId: { type: String, default: null },
        page: { type: String, default: "" },
        roomId: { type: String, default: null },
        refCode: { type: String, index: true, default: null },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        createdAt: { type: Date, default: Date.now }
      }, { collection: "analytics_events", versionKey: false });
      eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: eventTtlSeconds });

      const rollupSchema = new mongoose.Schema({
        key: { type: String, unique: true, index: true },
        bucketType: { type: String, index: true },
        bucketStart: { type: Date, index: true },
        uniqueVisitors: Number,
        sessions: Number,
        pageViews: Number,
        newUsers: Number,
        activeUsers: Number,
        peakOnline: Number,
        apiRequests: Number,
        apiErrors: Number,
        latencyCount: Number,
        totalLatencyMs: Number,
        latencyBuckets: mongoose.Schema.Types.Mixed,
        messagesSent: Number,
        uploadsStarted: Number,
        uploadsCompleted: Number,
        uploadsFailed: Number,
        uploadBytes: Number,
        roomJoins: Number,
        callsStarted: Number,
        referralClicks: Number,
        pageLoadCount: Number,
        totalPageLoadMs: Number,
        featureCounts: mongoose.Schema.Types.Mixed
      }, { collection: "analytics_rollups", versionKey: false });

      const userSchema = new mongoose.Schema({
        userId: { type: String, unique: true, index: true },
        firstSeenAt: Date,
        lastSeenAt: Date,
        sessions: Number,
        pageViews: Number,
        heartbeats: Number,
        activeMinutes: Number,
        messagesSent: Number,
        uploadsStarted: Number,
        uploadsCompleted: Number,
        uploadsFailed: Number,
        uploadBytes: Number,
        roomJoins: Number,
        callsStarted: Number,
        pageLoadCount: Number,
        totalPageLoadMs: Number,
        deviceCounts: mongoose.Schema.Types.Mixed,
        featureCounts: mongoose.Schema.Types.Mixed
      }, { collection: "analytics_user_stats", versionKey: false });

      const referralSchema = new mongoose.Schema({
        code: { type: String, unique: true, index: true },
        ownerUserId: { type: String, index: true },
        clicks: Number,
        uniqueClicks: Number,
        registrations: Number,
        activatedUsers: Number,
        lastClickAt: Date,
        createdAt: Date,
        uniqueVisitors: [String]
      }, { collection: "analytics_referrals", versionKey: false });

      const systemSchema = new mongoose.Schema({
        at: { type: Date },
        memory: mongoose.Schema.Types.Mixed,
        load: [Number],
        eventLoopLagMs: Number,
        eventLoopMaxLagMs: Number,
        activeUsers: Number,
        activeSockets: Number,
        runtime: mongoose.Schema.Types.Mixed
      }, { collection: "analytics_system_metrics", versionKey: false });
      systemSchema.index({ at: 1 }, { expireAfterSeconds: Math.max(7 * DAY / 1000, eventTtlSeconds) });

      analyticsModels = {
        Event: mongoose.models.TomiAnalyticsEvent || mongoose.model("TomiAnalyticsEvent", eventSchema),
        Rollup: mongoose.models.TomiAnalyticsRollup || mongoose.model("TomiAnalyticsRollup", rollupSchema),
        User: mongoose.models.TomiAnalyticsUser || mongoose.model("TomiAnalyticsUser", userSchema),
        Referral: mongoose.models.TomiAnalyticsReferral || mongoose.model("TomiAnalyticsReferral", referralSchema),
        System: mongoose.models.TomiAnalyticsSystem || mongoose.model("TomiAnalyticsSystem", systemSchema)
      };

      const [remoteRollups, remoteUsers, remoteReferrals] = await Promise.all([
        analyticsModels.Rollup.find({ bucketStart: { $gte: new Date(Date.now() - 120 * DAY) } }).lean().exec(),
        analyticsModels.User.find({}).lean().exec(),
        analyticsModels.Referral.find({}).lean().exec()
      ]);
      for (const raw of remoteRollups || []) {
        const bucket = normalizeBucket(raw);
        buckets.set(bucket.key, bucket);
      }
      for (const raw of remoteUsers || []) {
        const user = normalizeUserStats(raw);
        if (user.userId) users.set(user.userId, user);
      }
      for (const raw of remoteReferrals || []) {
        const referral = normalizeReferral(raw);
        if (referral.code) referrals.set(referral.code, referral);
      }
      return true;
    } catch (error) {
      analyticsModels = null;
      console.warn("Analytics MongoDB setup failed; using memory/local rollups:", error.message);
      return false;
    }
  }

  function start() {
    if (started) return;
    started = true;
    try { moduleEventLoopMonitor.enable(); } catch (_) {}
    flushTimer = setInterval(() => flush().catch(() => {}), flushIntervalMs);
    flushTimer.unref?.();
    systemTimer = setInterval(() => collectSystemSample(), MINUTE);
    systemTimer.unref?.();
    cleanupTimer = setInterval(pruneRuntime, MINUTE);
    cleanupTimer.unref?.();
    collectSystemSample();
  }

  let moduleEventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
  moduleEventLoopMonitor.enable();
  // The function is intentionally referenced through a variable so start() can
  // replace the initial monitor with one that is created at the correct time.
  const eventLoopMonitor = {
    get mean() { return moduleEventLoopMonitor.mean; },
    get max() { return moduleEventLoopMonitor.max; },
    reset() { moduleEventLoopMonitor.reset(); }
  };

  async function stop() {
    if (flushTimer) clearInterval(flushTimer);
    if (systemTimer) clearInterval(systemTimer);
    if (cleanupTimer) clearInterval(cleanupTimer);
    flushTimer = systemTimer = cleanupTimer = null;
    started = false;
    await flush();
    try { moduleEventLoopMonitor.disable(); } catch (_) {}
  }

  return {
    httpMiddleware,
    captureReferral,
    clearReferralCookie,
    track,
    heartbeat,
    socketConnected,
    socketDisconnected,
    setRuntimeProvider,
    ensureReferralCode,
    ensureAllReferralCodes,
    referralForUser,
    getOverview,
    getTimeseries,
    getSystemSeries,
    getUsersStats,
    getReferrals,
    buildAiSummary,
    configureMongo,
    start,
    stop,
    getActiveUsers: activeUniqueCount,
    getActiveSockets: activeSocketCount
  };
}

module.exports = { createAnalyticsService };
