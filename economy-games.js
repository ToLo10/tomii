"use strict";

const crypto = require("node:crypto");

const PLATFORM_OWNER_USERNAME = "tomi";
const DAILY_COIN_REWARD = 500;
const MAX_COIN_BALANCE = 9_000_000_000;
const MAX_CHARISMA = 100_000_000;
const COIN_TRANSACTION_HISTORY_LIMIT = 10;
const ECONOMY_TIME_ZONE = process.env.TOMI_COIN_TIME_ZONE || "Asia/Baghdad";
const ROULETTE_SLOTS = Object.freeze([
  { slot: 0, icon: "🍉", label: "بطيخ", category: "fruit", multiplier: 5, chancePercent: 19.4 },
  { slot: 1, icon: "🍊", label: "برتقال", category: "fruit", multiplier: 5, chancePercent: 19.4 },
  { slot: 2, icon: "🍎", label: "تفاح", category: "fruit", multiplier: 5, chancePercent: 19.4 },
  { slot: 3, icon: "🥬", label: "خضار", category: "fruit", multiplier: 5, chancePercent: 19.4 },
  { slot: 4, icon: "🐟", label: "سمك", category: "meat", multiplier: 10, chancePercent: 9.5 },
  { slot: 5, icon: "🍔", label: "برغر", category: "meat", multiplier: 15, chancePercent: 7 },
  { slot: 6, icon: "🍤", label: "روبيان", category: "meat", multiplier: 25, chancePercent: 3.8 },
  { slot: 7, icon: "🍗", label: "دجاج", category: "meat", multiplier: 45, chancePercent: 2.1 }
]);
const ROULETTE_SLOT_COUNT = ROULETTE_SLOTS.length;
const ROULETTE_WIN_MULTIPLIER = 2;
const ROULETTE_DENOMINATIONS = Object.freeze([20, 100, 1_000, 5_000]);
const ROULETTE_BETTING_MS = 30_000;
const ROULETTE_SPIN_MS = 7_000;
const ROULETTE_RESULTS_MS = 5_000;
const ROULETTE_HISTORY_LIMIT = 8;
const ROULETTE_DAILY_PRIZES = Object.freeze([2_000, 1_000, 500]);
const ROULETTE_SALAD_MIN_DELAY_MS = 2 * 60 * 60 * 1000;
const ROULETTE_SALAD_MAX_DELAY_MS = 6 * 60 * 60 * 1000;

function randomRouletteSaladDelayMs() {
  return crypto.randomInt(ROULETTE_SALAD_MIN_DELAY_MS, ROULETTE_SALAD_MAX_DELAY_MS + 1);
}

// The charisma thresholds intentionally follow the progression shown in the
// TOMI reference: stars, diamonds, crowns, then the higher royal tiers.
const CHARISMA_LEVELS = Object.freeze([
  { level: 0, minimum: 0, icon: "", label: "بدون شارة" },
  { level: 1, minimum: 1_000, icon: "⭐", label: "نجمة 1" },
  { level: 2, minimum: 4_000, icon: "⭐", label: "نجمة 2" },
  { level: 3, minimum: 12_000, icon: "⭐", label: "نجمة 3" },
  { level: 4, minimum: 30_000, icon: "💎", label: "ألماسة 4" },
  { level: 5, minimum: 80_000, icon: "💎", label: "ألماسة 5" },
  { level: 6, minimum: 160_000, icon: "💎", label: "ألماسة 6" },
  { level: 7, minimum: 300_000, icon: "👑", label: "تاج 7" },
  { level: 8, minimum: 500_000, icon: "👑", label: "تاج 8" },
  { level: 9, minimum: 1_000_000, icon: "👑", label: "تاج 9" },
  { level: 10, minimum: 2_000_000, icon: "🏆", label: "ملك 10" },
  { level: 11, minimum: 3_500_000, icon: "🏆", label: "ملك 11" },
  { level: 12, minimum: 6_000_000, icon: "🏆", label: "ملك 12" },
  { level: 13, minimum: 8_500_000, icon: "👑✨", label: "ملكي 13" },
  { level: 14, minimum: 12_000_000, icon: "👑✨", label: "ملكي 14" },
  { level: 15, minimum: 16_000_000, icon: "👑✨", label: "ملكي 15" }
]);

const GAME_SPECS = Object.freeze({
  dice_duel: {
    id: "dice_duel",
    name: "مباراة النرد",
    description: "ارمِ النرد، والرقم الأعلى يفوز بالجولة.",
    icon: "fa-dice",
    action: "roll",
    allowedPlayers: [2],
    actionLabel: "ارمِ النرد"
  },
  number_battle: {
    id: "number_battle",
    name: "معركة الأرقام",
    description: "اختَر رقمًا من 1 إلى 100؛ الرقم الأعلى يفوز.",
    icon: "fa-hashtag",
    action: "number",
    allowedPlayers: [2, 4],
    actionLabel: "أرسل الرقم"
  },
  rock_paper_scissors: {
    id: "rock_paper_scissors",
    name: "حجر ورق مقص",
    description: "مباراة سريعة بين لاعبين.",
    icon: "fa-hand-scissors",
    action: "choice",
    allowedPlayers: [2],
    choices: ["حجر", "ورق", "مقص"],
    actionLabel: "اختَر"
  },
  coin_flip: {
    id: "coin_flip",
    name: "عملة الحظ",
    description: "اختَر صورة أو كتابة، والنتيجة يحددها السيرفر.",
    icon: "fa-coins",
    action: "choice",
    allowedPlayers: [2, 4],
    choices: ["صورة", "كتابة"],
    randomChoice: true,
    actionLabel: "اختَر"
  },
  odd_even: {
    id: "odd_even",
    name: "زوجي أو فردي",
    description: "اختَر زوجي أو فردي، ثم يكشف السيرفر الرقم.",
    icon: "fa-shuffle",
    action: "choice",
    allowedPlayers: [2, 4],
    choices: ["زوجي", "فردي"],
    randomChoice: true,
    actionLabel: "اختَر"
  },
  high_card: {
    id: "high_card",
    name: "أعلى ورقة",
    description: "اختَر ورقة من 1 إلى 13؛ الأعلى يفوز.",
    icon: "fa-cards-blank",
    action: "number",
    allowedPlayers: [2, 4],
    maxValue: 13,
    actionLabel: "أرسل الورقة"
  }
});

const RPS_BEATS = Object.freeze({
  حجر: "مقص",
  ورق: "حجر",
  مقص: "ورق"
});

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function isoNow() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(7).toString("hex")}`;
}

function publicCharisma(user) {
  const points = Math.max(0, Math.min(MAX_CHARISMA, integer(user?.charisma, 0)));
  let current = CHARISMA_LEVELS[0];
  for (const level of CHARISMA_LEVELS) {
    if (points >= level.minimum) current = level;
  }
  const next = CHARISMA_LEVELS.find(level => level.minimum > points) || null;
  const progressStart = current.minimum;
  const progressEnd = next?.minimum || Math.max(progressStart + 1, current.minimum);
  const progress = next
    ? Math.max(0, Math.min(100, ((points - progressStart) / Math.max(1, progressEnd - progressStart)) * 100))
    : 100;
  return {
    points,
    level: current.level,
    icon: current.icon,
    label: current.label,
    nextLevel: next?.level || current.level,
    nextMinimum: next?.minimum || null,
    pointsToNext: next ? Math.max(0, next.minimum - points) : 0,
    progress: Math.round(progress),
    maxLevel: CHARISMA_LEVELS[CHARISMA_LEVELS.length - 1].level
  };
}

function findUserKey(db, value) {
  const wanted = clampText(value, 40);
  if (!wanted || !db?.users) return "";
  if (db.users[wanted]) return wanted;
  const lower = wanted.toLowerCase();
  return Object.keys(db.users).find(username => String(username).toLowerCase() === lower) || "";
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clampText(value, max = 120) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function dailyDateKey(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ECONOMY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

function ensureEconomyState(db) {
  let changed = false;
  if (!db.shopItems || typeof db.shopItems !== "object" || Array.isArray(db.shopItems)) {
    db.shopItems = {};
    changed = true;
  }
  if (!db.gameRooms || typeof db.gameRooms !== "object" || Array.isArray(db.gameRooms)) {
    db.gameRooms = {};
    changed = true;
  }
  if (!db.gameInvites || typeof db.gameInvites !== "object" || Array.isArray(db.gameInvites)) {
    db.gameInvites = {};
    changed = true;
  }
  if (!Array.isArray(db.rouletteRounds)) {
    db.rouletteRounds = [];
    changed = true;
  }
  if (!Array.isArray(db.rouletteWinners)) {
    db.rouletteWinners = [];
    changed = true;
  }
  if (!Array.isArray(db.rouletteLeaderboard)) {
    db.rouletteLeaderboard = [];
    changed = true;
  }
  if (!Array.isArray(db.rouletteDailyAwards)) {
    db.rouletteDailyAwards = [];
    changed = true;
  }
  if (!db.rouletteControl || typeof db.rouletteControl !== "object") {
    db.rouletteControl = { mode: "random", slot: null, updatedAt: null, updatedBy: null };
    changed = true;
  }
  if (typeof db.rouletteCurrentDate !== "string") {
    db.rouletteCurrentDate = "";
    changed = true;
  }
  if (!Number.isSafeInteger(Number(db.rouletteSaladNextAt)) || Number(db.rouletteSaladNextAt) <= 0) {
    db.rouletteSaladNextAt = Date.now() + randomRouletteSaladDelayMs();
    changed = true;
  }
  return changed;
}

function ensureEconomyUser(user) {
  if (!user || typeof user !== "object") return false;
  let changed = false;
  const coins = integer(user.coins, 0);
  const safeCoins = Math.max(0, Math.min(MAX_COIN_BALANCE, coins));
  if (user.coins !== safeCoins) {
    user.coins = safeCoins;
    changed = true;
  }
  if (!Array.isArray(user.inventory)) {
    user.inventory = [];
    changed = true;
  }
  if (!Array.isArray(user.coinTransactions)) {
    user.coinTransactions = [];
    changed = true;
  } else if (user.coinTransactions.length > COIN_TRANSACTION_HISTORY_LIMIT) {
    user.coinTransactions = user.coinTransactions.slice(0, COIN_TRANSACTION_HISTORY_LIMIT);
    changed = true;
  }
  if (!Array.isArray(user.rouletteHistory)) {
    user.rouletteHistory = [];
    changed = true;
  }
  if (!Array.isArray(user.rouletteLastBets)) {
    user.rouletteLastBets = [];
    changed = true;
  }
  const charisma = Math.max(0, Math.min(MAX_CHARISMA, integer(user.charisma, 0)));
  if (user.charisma !== charisma) {
    user.charisma = charisma;
    changed = true;
  }
  if (!Array.isArray(user.receivedGifts)) {
    user.receivedGifts = [];
    changed = true;
  }
  if (!Array.isArray(user.sentGifts)) {
    user.sentGifts = [];
    changed = true;
  }
  if (!Array.isArray(user.charismaHistory)) {
    user.charismaHistory = [];
    changed = true;
  }
  if (typeof user.lastDailyRewardDate !== "string") {
    user.lastDailyRewardDate = "";
    changed = true;
  }
  return changed;
}

function createTransaction(user, { delta = 0, type = "adjustment", reason = "", metadata = null } = {}) {
  ensureEconomyUser(user);
  const entry = {
    id: randomId("txn"),
    delta: integer(delta),
    balance: integer(user.coins),
    type: clampText(type, 40),
    reason: clampText(reason, 180),
    metadata: metadata && typeof metadata === "object" ? metadata : null,
    createdAt: isoNow()
  };
  user.coinTransactions.unshift(entry);
  user.coinTransactions = user.coinTransactions.slice(0, COIN_TRANSACTION_HISTORY_LIMIT);
  return entry;
}

function createCharismaEntry(user, { delta = 0, type = "adjustment", reason = "", metadata = null } = {}) {
  ensureEconomyUser(user);
  const entry = {
    id: randomId("charisma"),
    delta: integer(delta),
    balance: integer(user.charisma),
    type: clampText(type, 40),
    reason: clampText(reason, 180),
    metadata: metadata && typeof metadata === "object" ? metadata : null,
    createdAt: isoNow()
  };
  user.charismaHistory.unshift(entry);
  user.charismaHistory = user.charismaHistory.slice(0, 100);
  return entry;
}

function publicItem(item) {
  if (!item) return null;
  return {
    itemId: item.itemId,
    type: item.type,
    name: item.name,
    description: item.description || "",
    price: Math.max(0, integer(item.price)),
    active: item.active !== false,
    icon: item.icon || "fa-gift",
    imageUrl: item.imageUrl || "",
    frameId: item.frameId || null,
    frameUrl: item.frameUrl || "",
    animated: Boolean(item.animated),
    charismaValue: item.type === "gift" ? Math.max(1, integer(item.charismaValue, Math.max(1, Math.ceil(integer(item.price) / 5)))) : 0,
    stock: item.stock == null ? null : Math.max(0, integer(item.stock)),
    sold: Math.max(0, integer(item.sold)),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

function publicInventoryEntry(entry, items) {
  const item = items?.[entry?.itemId] || null;
  return {
    inventoryId: entry?.inventoryId || "",
    itemId: entry?.itemId || "",
    type: entry?.type || item?.type || "custom",
    name: entry?.name || item?.name || "عنصر",
    description: entry?.description || item?.description || "",
    icon: entry?.icon || item?.icon || "fa-gift",
    imageUrl: entry?.imageUrl || item?.imageUrl || "",
    frameId: entry?.frameId || item?.frameId || null,
    frameUrl: entry?.frameUrl || item?.frameUrl || "",
    animated: Boolean(entry?.animated ?? item?.animated),
    charismaValue: entry?.type === "gift" || item?.type === "gift"
      ? Math.max(1, integer(entry?.charismaValue ?? item?.charismaValue, Math.max(1, Math.ceil(integer(entry?.price ?? item?.price) / 5))))
      : 0,
    transferable: (entry?.type || item?.type) === "gift",
    purchasedAt: entry?.purchasedAt || null,
    metadata: entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : (item?.metadata || {})
  };
}

function publicGiftTransfer(entry) {
  return {
    giftId: entry?.giftId || "",
    itemId: entry?.itemId || "",
    name: entry?.name || "هدية",
    icon: entry?.icon || "fa-gift",
    imageUrl: entry?.imageUrl || "",
    animated: Boolean(entry?.animated),
    fromUsername: entry?.fromUsername || "",
    toUsername: entry?.toUsername || "",
    charismaValue: Math.max(1, integer(entry?.charismaValue, 1)),
    sentAt: entry?.sentAt || null
  };
}

function registerEconomyGames({
  app,
  io,
  requireHttpAuth,
  authLimiter,
  getDb,
  saveDb,
  hashPassword,
  validatePassword,
  publicUserProfile,
  hasPermission,
  activeOnlineUsers,
  emitToStaffWithPermission
}) {
  const persist = () => saveDb(getDb());
  const gameRate = new Map();
  let activeRouletteRound = null;
  let rouletteTimer = null;

  function dbState() {
    const db = getDb();
    ensureEconomyState(db);
    return db;
  }

  function walletPayload(username, { claimDaily = false } = {}) {
    const db = dbState();
    const user = db.users?.[username];
    if (!user) return null;
    const userChanged = ensureEconomyUser(user);
    const daily = { claimed: false, amount: 0, date: dailyDateKey(), available: user.lastDailyRewardDate !== dailyDateKey() };
    if (claimDaily && user.lastDailyRewardDate !== daily.date) {
      user.coins = Math.min(MAX_COIN_BALANCE, user.coins + DAILY_COIN_REWARD);
      user.lastDailyRewardDate = daily.date;
      createTransaction(user, {
        delta: DAILY_COIN_REWARD,
        type: "daily_reward",
        reason: "المكافأة اليومية من TOMI"
      });
      daily.claimed = true;
      daily.amount = DAILY_COIN_REWARD;
      daily.available = false;
    }
    if (userChanged || daily.claimed) persist();

    const inventory = user.inventory
      .slice()
      .reverse()
      .map(entry => publicInventoryEntry(entry, db.shopItems));
    return {
      username,
      coins: user.coins,
      charisma: publicCharisma(user),
      daily,
      nextDailyDate: dailyDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      inventory,
      receivedGifts: user.receivedGifts.slice(0, 50).map(publicGiftTransfer),
      sentGifts: user.sentGifts.slice(0, 50).map(publicGiftTransfer),
      charismaHistory: user.charismaHistory.slice(0, 50),
      rouletteLastBets: user.rouletteLastBets.slice(0, 50),
      transactions: user.coinTransactions.slice(0, COIN_TRANSACTION_HISTORY_LIMIT),
      rouletteHistory: user.rouletteHistory.slice(0, ROULETTE_HISTORY_LIMIT)
    };
  }

  function ensureDefaultShopItems() {
    const db = dbState();
    let changed = false;
    const defaultItems = [
      { itemId: "gift_heart", type: "gift", name: "هدية قلب", description: "هدية رقمية مميزة داخل محفظتك.", price: 25, charismaValue: 5, icon: "fa-heart", active: true },
      { itemId: "gift_star", type: "gift", name: "هدية نجمة", description: "هدية رقمية لامعة.", price: 50, charismaValue: 10, icon: "fa-star", active: true },
      { itemId: "gift_crown", type: "gift", name: "هدية تاج", description: "هدية خاصة للأصدقاء.", price: 100, charismaValue: 20, icon: "fa-crown", active: true }
    ];
    for (const item of defaultItems) {
      if (!db.shopItems[item.itemId]) {
        db.shopItems[item.itemId] = { ...item, sold: 0, createdAt: isoNow(), updatedAt: isoNow() };
        changed = true;
      }
    }
    for (const frame of Object.values(db.frames || {})) {
      if (!frame?.frameId) continue;
      const itemId = `frame_${frame.frameId}`;
      const existing = db.shopItems[itemId];
      if (!existing) {
        db.shopItems[itemId] = {
          itemId,
          type: "frame",
          name: frame.name || "إطار TOMI",
          description: "إطار لصورة الحساب يظهر في الدردشة والغرف الصوتية.",
          price: Math.max(0, integer(frame.price, 500) || 500),
          icon: "fa-image",
          imageUrl: frame.url || `/api/files/${encodeURIComponent(frame.fileId || "")}`,
          frameId: frame.frameId,
          frameUrl: frame.url || `/api/files/${encodeURIComponent(frame.fileId || "")}`,
          animated: Boolean(frame.animated),
          active: true,
          sold: 0,
          createdAt: frame.createdAt || isoNow(),
          updatedAt: isoNow()
        };
        changed = true;
      } else if (existing.frameId === frame.frameId) {
        let itemChanged = false;
        if (existing.frameUrl !== frame.url && frame.url) { existing.frameUrl = frame.url; existing.imageUrl = frame.url; itemChanged = true; }
        if (existing.animated !== Boolean(frame.animated)) { existing.animated = Boolean(frame.animated); itemChanged = true; }
        if (itemChanged) { existing.updatedAt = isoNow(); changed = true; }
      }
    }
    if (changed) persist();
    return Object.values(db.shopItems).filter(Boolean).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }

  function userHasItem(user, itemId, frameId = null) {
    ensureEconomyUser(user);
    return user.inventory.some(entry => entry?.itemId === itemId || (frameId && entry?.frameId === frameId));
  }

  function itemCharismaValue(item, fallbackPrice = 0) {
    return Math.max(1, integer(item?.charismaValue, Math.max(1, Math.ceil(integer(item?.price, fallbackPrice) / 5))));
  }

  function emitWallet(username) {
    if (!username) return;
    io.to(`user_${username}`).emit("wallet-updated", walletPayload(username, { claimDaily: false }));
  }

  function rouletteSlot(slotId) {
    return ROULETTE_SLOTS.find(item => item.slot === integer(slotId, -1)) || null;
  }

  function roulettePublicResult(result) {
    if (!result) return null;
    return {
      kind: result.kind || "item",
      category: result.category || null,
      slot: result.slot == null ? null : integer(result.slot),
      displaySlot: result.displaySlot == null ? null : integer(result.displaySlot),
      icon: result.icon || "✨",
      label: result.label || "نتيجة العجلة",
      multiplier: result.multiplier == null ? null : Number(result.multiplier),
      createdAt: result.createdAt || null
    };
  }

  function roulettePlayer(username) {
    const profile = publicUserProfile(username) || {};
    return {
      username,
      displayName: profile.displayName || username,
      avatar: profile.avatar || "",
      frame: profile.frame || null,
      charisma: profile.charisma || publicCharisma(dbState().users?.[username])
    };
  }

  function rouletteDailyLeaderboard(date = dailyDateKey()) {
    const db = dbState();
    return db.rouletteLeaderboard
      .filter(row => row?.date === date)
      .sort((a, b) => Number(b.totalPayout || 0) - Number(a.totalPayout || 0) || Number(b.wins || 0) - Number(a.wins || 0))
      .slice(0, 20)
      .map(row => ({
        ...row,
        ...roulettePlayer(row.username)
      }));
  }

  function publicRouletteState(actor = "") {
    const db = dbState();
    const round = activeRouletteRound;
    const totals = Object.fromEntries(ROULETTE_SLOTS.map(item => [String(item.slot), 0]));
    if (round) {
      for (const bets of Object.values(round.bets || {})) {
        for (const [slotId, amount] of Object.entries(bets || {})) totals[slotId] = Number(totals[slotId] || 0) + Number(amount || 0);
      }
    }
    // Keep the live board useful without exposing another player's exact stake.
    // Only the three busiest cells are marked HOT; the viewer's own amount is
    // returned separately below and is therefore visible only to that viewer.
    const hotRanks = new Map(
      Object.entries(totals)
        .filter(([, amount]) => Number(amount || 0) > 0)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || Number(a[0]) - Number(b[0]))
        .slice(0, 3)
        .map(([slotId], index) => [Number(slotId), index + 1])
    );
    const ownBets = actor && round?.bets?.[actor]
      ? Object.entries(round.bets[actor]).map(([slot, amount]) => ({ slot: integer(slot), amount: Number(amount || 0) })).filter(item => item.amount > 0)
      : [];
    const recentRounds = db.rouletteRounds.slice(0, ROULETTE_HISTORY_LIMIT).map(item => ({
      roundId: item.roundId,
      date: item.date,
      result: roulettePublicResult(item.result),
      totalBet: Number(item.totalBet || 0),
      totalPayout: Number(item.totalPayout || 0),
      winnerCount: Number(item.winnerCount || 0),
      winners: (item.winners || []).slice(0, 10),
      createdAt: item.createdAt || null
    }));
    return {
      version: 2,
      roundId: round?.roundId || null,
      status: round?.status || "waiting",
      date: round?.date || dailyDateKey(),
      startedAt: round?.startedAt || null,
      bettingEndsAt: round?.bettingEndsAt || null,
      spinStartedAt: round?.spinStartedAt || null,
      spinEndsAt: round?.spinEndsAt || null,
      resultsEndsAt: round?.resultsEndsAt || null,
      result: roulettePublicResult(round?.result),
      roundSummary: round?.roundSummary ? {
        roundId: round.roundSummary.roundId,
        date: round.roundSummary.date,
        result: roulettePublicResult(round.roundSummary.result),
        totalBet: Number(round.roundSummary.totalBet || 0),
        totalPayout: Number(round.roundSummary.totalPayout || 0),
        winnerCount: Number(round.roundSummary.winnerCount || 0),
        winners: [...(round.roundSummary.winners || [])]
          .sort((a, b) => Number(b.payout || 0) - Number(a.payout || 0))
          .slice(0, 3)
          .map(row => ({ ...row, ...roulettePlayer(row.username) })),
        createdAt: round.roundSummary.createdAt || null
      } : null,
      slots: ROULETTE_SLOTS,
      denominations: ROULETTE_DENOMINATIONS,
      slotBets: ROULETTE_SLOTS.map(item => ({
        ...item,
        // Do not send totalBet to browsers: it reveals other users' wagers.
        hotRank: hotRanks.get(Number(item.slot)) || 0
      })),
      ownBets,
      recentRounds,
      recentWinners: db.rouletteWinners.slice(0, 30).map(item => ({ ...item, ...roulettePlayer(item.username) })),
      leaderboard: rouletteDailyLeaderboard(round?.date || dailyDateKey()),
      dailyPrizes: ROULETTE_DAILY_PRIZES,
      dailyAwards: db.rouletteDailyAwards.slice(0, 5),
      rouletteControl: actor === PLATFORM_OWNER_USERNAME ? db.rouletteControl : null
    };
  }

  function broadcastRoulette(eventName) {
    io.to("roulette_live").emit(eventName, publicRouletteState());
  }

  function scheduleRoulette(callback, delay) {
    clearTimeout(rouletteTimer);
    rouletteTimer = setTimeout(callback, Math.max(0, delay));
    rouletteTimer.unref?.();
  }

  function chooseRouletteResult() {
    const db = dbState();
    const control = db.rouletteControl || { mode: "random", slot: null };
    const displaySlotForCategory = category => {
      const eligible = ROULETTE_SLOTS.filter(item => item.category === category);
      return eligible[crypto.randomInt(0, eligible.length)].slot;
    };
    const saladResult = category => ({
      kind: "salad",
      category,
      icon: category === "fruit" ? "🥗" : "🍖",
      label: category === "fruit" ? "سلطة فواكه" : "سلطة لحوم",
      displaySlot: displaySlotForCategory(category),
      createdAt: isoNow()
    });
    const forcedCategory = control.mode === "fruit_salad" ? "fruit" : control.mode === "meat_salad" ? "meat" : null;
    if (forcedCategory) {
      return saladResult(forcedCategory);
    }
    if (control.mode === "slot" && rouletteSlot(control.slot)) {
      const item = rouletteSlot(control.slot);
      return { kind: "item", category: item.category, slot: item.slot, displaySlot: item.slot, icon: item.icon, label: item.label, multiplier: item.multiplier, createdAt: isoNow() };
    }
    if (Date.now() >= Number(db.rouletteSaladNextAt || 0)) {
      const category = crypto.randomInt(0, 2) === 0 ? "fruit" : "meat";
      db.rouletteSaladNextAt = Date.now() + randomRouletteSaladDelayMs();
      return saladResult(category);
    }
    let weightedDraw = crypto.randomInt(0, 1_000);
    let item = ROULETTE_SLOTS[ROULETTE_SLOT_COUNT - 1];
    for (const candidate of ROULETTE_SLOTS) {
      weightedDraw -= Math.round(candidate.chancePercent * 10);
      if (weightedDraw < 0) {
        item = candidate;
        break;
      }
    }
    return { kind: "item", category: item.category, slot: item.slot, displaySlot: item.slot, icon: item.icon, label: item.label, multiplier: item.multiplier, createdAt: isoNow() };
  }

  function addRouletteLeaderboard(username, date, totalBet, payout) {
    if (payout <= 0) return;
    const db = dbState();
    let row = db.rouletteLeaderboard.find(item => item?.date === date && item?.username === username);
    if (!row) {
      row = { date, username, wins: 0, totalBet: 0, totalPayout: 0, net: 0, updatedAt: isoNow() };
      db.rouletteLeaderboard.push(row);
    }
    row.wins = Number(row.wins || 0) + 1;
    row.totalBet = Number(row.totalBet || 0) + totalBet;
    row.totalPayout = Number(row.totalPayout || 0) + payout;
    row.net = Number(row.totalPayout || 0) - Number(row.totalBet || 0);
    row.updatedAt = isoNow();
    db.rouletteLeaderboard = db.rouletteLeaderboard.slice(-500);
  }

  function awardDailyPrizes(date) {
    if (!date) return null;
    const db = dbState();
    if (db.rouletteDailyAwards.some(item => item?.date === date)) return null;
    const board = rouletteDailyLeaderboard(date).slice(0, ROULETTE_DAILY_PRIZES.length);
    const winners = [];
    board.forEach((row, index) => {
      const user = db.users?.[row.username];
      if (!user) return;
      ensureEconomyUser(user);
      const prize = ROULETTE_DAILY_PRIZES[index];
      user.coins = Math.min(MAX_COIN_BALANCE, user.coins + prize);
      createTransaction(user, { delta: prize, type: "roulette_daily_prize", reason: `جائزة المركز ${index + 1} في عجلة TOMI`, metadata: { date, rank: index + 1 } });
      winners.push({ rank: index + 1, username: row.username, displayName: row.displayName || row.username, prize, totalPayout: row.totalPayout || 0 });
    });
    const award = { date, winners, awardedAt: isoNow() };
    db.rouletteDailyAwards.unshift(award);
    db.rouletteDailyAwards = db.rouletteDailyAwards.slice(0, 30);
    persist();
    winners.forEach(item => emitWallet(item.username));
    io.to("roulette_live").emit("roulette:daily-awards", award);
    return award;
  }

  function settleRouletteRound() {
    const round = activeRouletteRound;
    if (!round || round.status !== "betting") return null;
    const db = dbState();
    const result = chooseRouletteResult();
    const winners = [];
    let totalBet = 0;
    let totalPayout = 0;
    for (const [username, bets] of Object.entries(round.bets || {})) {
      const user = db.users?.[username];
      if (!user) continue;
      ensureEconomyUser(user);
      const chips = Array.isArray(round.chips?.[username]) ? round.chips[username] : [];
      const entries = Object.entries(bets || {});
      const playerBet = entries.reduce((sum, [, amount]) => sum + Number(amount || 0), 0);
      const payout = entries.reduce((sum, [slotId, amount]) => {
        const item = rouletteSlot(slotId);
        if (!item) return sum;
        const hit = result.kind === "salad" ? item.category === result.category : item.slot === result.slot;
        return sum + (hit ? Number(amount || 0) * Number(item.multiplier || 1) : 0);
      }, 0);
      totalBet += playerBet;
      totalPayout += payout;
      user.rouletteLastBets = chips.slice(0, 80);
      if (payout > 0) {
        user.coins = Math.min(MAX_COIN_BALANCE, user.coins + payout);
        createTransaction(user, { delta: payout, type: "roulette_win", reason: `فوز في عجلة TOMI: ${result.label}`, metadata: { roundId: round.roundId, payout, result: roulettePublicResult(result) } });
        winners.push({ username, displayName: user.displayName || username, payout, totalBet: playerBet, net: payout - playerBet, result: roulettePublicResult(result), roundId: round.roundId, date: round.date, createdAt: isoNow() });
        addRouletteLeaderboard(username, round.date, playerBet, payout);
      }
      user.rouletteHistory.unshift({ roundId: round.roundId, date: round.date, result: roulettePublicResult(result), totalBet: playerBet, payout, net: payout - playerBet, won: payout > 0, createdAt: isoNow() });
      user.rouletteHistory = user.rouletteHistory.slice(0, ROULETTE_HISTORY_LIMIT);
      emitWallet(username);
    }
    const summary = {
      roundId: round.roundId,
      date: round.date,
      result: roulettePublicResult(result),
      totalBet,
      totalPayout,
      winnerCount: winners.length,
      winners: winners.slice(0, 30),
      createdAt: isoNow()
    };
    db.rouletteRounds.unshift(summary);
    db.rouletteRounds = db.rouletteRounds.slice(0, ROULETTE_HISTORY_LIMIT);
    db.rouletteWinners = [...winners, ...db.rouletteWinners].slice(0, 200);
    round.status = "spinning";
    round.result = result;
    round.roundSummary = summary;
    round.spinStartedAt = Date.now();
    round.spinEndsAt = round.spinStartedAt + ROULETTE_SPIN_MS;
    round.resultsEndsAt = null;
    persist();
    return summary;
  }

  function startRouletteRound() {
    const db = dbState();
    const today = dailyDateKey();
    if (db.rouletteCurrentDate && db.rouletteCurrentDate !== today) awardDailyPrizes(db.rouletteCurrentDate);
    db.rouletteCurrentDate = today;
    activeRouletteRound = {
      roundId: randomId("roulette"),
      date: today,
      status: "betting",
      startedAt: Date.now(),
      bettingEndsAt: Date.now() + ROULETTE_BETTING_MS,
      spinStartedAt: null,
      spinEndsAt: null,
      resultsEndsAt: null,
      bets: {},
      chips: {},
      result: null
    };
    persist();
    broadcastRoulette("roulette:round-started");
    scheduleRoulette(() => {
      const summary = settleRouletteRound();
      if (!summary) return startRouletteRound();
      const roundId = activeRouletteRound.roundId;
      broadcastRoulette("roulette:spin-started");
      scheduleRoulette(() => {
        if (activeRouletteRound?.roundId !== roundId) return;
        activeRouletteRound.status = "results";
        activeRouletteRound.resultsEndsAt = Date.now() + ROULETTE_RESULTS_MS;
        persist();
        broadcastRoulette("roulette:results-started");
        scheduleRoulette(() => {
          if (activeRouletteRound?.roundId !== roundId) return;
          activeRouletteRound = null;
          startRouletteRound();
        }, ROULETTE_RESULTS_MS);
      }, ROULETTE_SPIN_MS);
    }, ROULETTE_BETTING_MS);
  }

  function ensureRouletteRound() {
    if (!activeRouletteRound) startRouletteRound();
    return activeRouletteRound;
  }

  function placeRouletteChips(username, chips) {
    const round = ensureRouletteRound();
    const db = dbState();
    const user = db.users?.[username];
    if (!user) return { success: false, error: "الحساب غير موجود" };
    if (round.status !== "betting" || Date.now() >= round.bettingEndsAt) return { success: false, error: "انتهى وقت المراهنة، انتظر الجولة القادمة" };
    const clean = (Array.isArray(chips) ? chips : []).slice(0, 80).map(chip => ({ slot: integer(chip?.slot, -1), denomination: integer(chip?.denomination, 0) }));
    if (!clean.length || clean.some(chip => !rouletteSlot(chip.slot) || !ROULETTE_DENOMINATIONS.includes(chip.denomination))) return { success: false, error: "الخانة أو مبلغ الرهان غير صالح" };
    const total = clean.reduce((sum, chip) => sum + chip.denomination, 0);
    ensureEconomyUser(user);
    if (user.coins < total) return { success: false, error: "رصيدك غير كافٍ" };
    if (!round.bets[username]) round.bets[username] = {};
    if (!round.chips[username]) round.chips[username] = [];
    for (const chip of clean) {
      user.coins -= chip.denomination;
      round.bets[username][chip.slot] = Number(round.bets[username][chip.slot] || 0) + chip.denomination;
      round.chips[username].push(chip);
    }
    createTransaction(user, { delta: -total, type: "roulette_bet", reason: "رهان في عجلة TOMI", metadata: { roundId: round.roundId, chips: clean } });
    persist();
    emitWallet(username);
    broadcastRoulette("roulette:state");
    return { success: true, wallet: walletPayload(username), state: publicRouletteState(username) };
  }

  function registerRouletteSocketHandlers(socket) {
    if (socket.__tomiRouletteRegistered) return;
    socket.__tomiRouletteRegistered = true;
    socket.on("roulette:subscribe", () => {
      const actor = socket.userId || socket.sessionUser;
      socket.join("roulette_live");
      socket.emit("roulette:state", publicRouletteState(actor));
    });
    socket.on("roulette:bet", ({ slot, denomination } = {}) => {
      const actor = socket.userId || socket.sessionUser;
      const result = placeRouletteChips(actor, [{ slot, denomination }]);
      socket.emit("roulette:bet-result", result);
      if (result.success) socket.emit("roulette:state", result.state);
    });
    socket.on("roulette:repeat", () => {
      const actor = socket.userId || socket.sessionUser;
      const user = dbState().users?.[actor];
      const result = placeRouletteChips(actor, user?.rouletteLastBets || []);
      socket.emit("roulette:bet-result", result);
      if (result.success) socket.emit("roulette:state", result.state);
    });
  }

  function adminActor(username) {
    return username === PLATFORM_OWNER_USERNAME || Boolean(hasPermission?.(username, "manage_permissions"));
  }

  function onlyOwner(req, res) {
    if (req.authUser !== PLATFORM_OWNER_USERNAME) {
      res.status(403).json({ error: "هذا الإجراء متاح لمالك المنصة فقط" });
      return false;
    }
    return true;
  }

  app.get("/api/economy/me", requireHttpAuth, (req, res) => {
    try {
      const db = dbState();
      ensureDefaultShopItems();
      const wallet = walletPayload(req.authUser, { claimDaily: true });
      res.json({
        success: true,
        wallet,
        charismaLevels: CHARISMA_LEVELS,
        rouletteSlots: ROULETTE_SLOTS,
        rouletteState: publicRouletteState(req.authUser),
        isOwner: req.authUser === PLATFORM_OWNER_USERNAME,
        role: db.users[req.authUser]?.role || "user"
      });
    } catch (error) {
      res.status(500).json({ error: "تعذر تحميل المحفظة" });
    }
  });

  app.post("/api/economy/daily-claim", requireHttpAuth, (req, res) => {
    try {
      const wallet = walletPayload(req.authUser, { claimDaily: true });
      res.json({ success: true, wallet, claimed: Boolean(wallet?.daily?.claimed) });
    } catch (_) {
      res.status(500).json({ error: "تعذر استلام المكافأة اليومية" });
    }
  });

  app.get("/api/economy/shop", requireHttpAuth, (_req, res) => {
    try {
      const items = ensureDefaultShopItems().filter(item => item.active !== false).map(publicItem);
      res.json({ success: true, items });
    } catch (_) {
      res.status(500).json({ error: "تعذر تحميل المتجر" });
    }
  });

  app.get("/api/economy/friends", requireHttpAuth, (req, res) => {
    const db = dbState();
    const friends = [];
    for (const friendship of Object.values(db.friends || {})) {
      if (!friendship) continue;
      const target = friendship.user1 === req.authUser ? friendship.user2 : friendship.user2 === req.authUser ? friendship.user1 : null;
      if (!target || !db.users[target]) continue;
      friends.push({
        ...publicUserProfile(target),
        isOnline: activeOnlineUsers?.has(target) || false
      });
    }
    res.json({ success: true, friends: friends.sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.username.localeCompare(b.username)) });
  });

  app.get("/api/economy/users", requireHttpAuth, (req, res) => {
    const db = dbState();
    const query = clampText(req.query.q || req.query.query, 40).toLowerCase();
    if (query.length < 1) return res.json({ success: true, users: [] });
    const users = Object.keys(db.users || {})
      .filter(username => username.toLowerCase().includes(query) || String(db.users[username]?.displayName || "").toLowerCase().includes(query))
      .slice(0, 20)
      .map(username => ({
        ...publicUserProfile(username),
        isOnline: activeOnlineUsers?.has(username) || false
      }));
    res.json({ success: true, users });
  });

  app.post("/api/economy/shop/purchase", requireHttpAuth, (req, res) => {
    try {
      const db = dbState();
      ensureDefaultShopItems();
      const itemId = clampText(req.body.itemId, 120);
      const item = db.shopItems[itemId];
      const user = db.users[req.authUser];
      if (!item || item.active === false) return res.status(404).json({ error: "العنصر غير موجود أو غير متاح" });
      if (!user) return res.status(401).json({ error: "الحساب غير موجود" });
      ensureEconomyUser(user);
      if (item.stock != null && integer(item.sold) >= integer(item.stock)) return res.status(400).json({ error: "نفدت كمية هذا العنصر" });
      const price = Math.max(0, integer(item.price));
      if (user.coins < price) return res.status(400).json({ error: "رصيدك من كوينز TOMI غير كافٍ" });
      if (item.type === "frame" && (!item.frameId || !db.frames?.[item.frameId])) return res.status(400).json({ error: "الإطار غير متوفر حاليًا" });

      user.coins -= price;
      createTransaction(user, { delta: -price, type: "purchase", reason: `شراء ${item.name}`, metadata: { itemId: item.itemId, price } });
      const inventoryEntry = {
        inventoryId: randomId("inv"),
        itemId: item.itemId,
        type: item.type,
        name: item.name,
        description: item.description || "",
        icon: item.icon || "fa-gift",
        imageUrl: item.imageUrl || "",
        frameId: item.frameId || null,
        frameUrl: item.frameUrl || "",
        animated: Boolean(item.animated),
        charismaValue: item.type === "gift" ? itemCharismaValue(item, price) : 0,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
        purchasedAt: isoNow()
      };
      user.inventory.push(inventoryEntry);
      item.sold = Math.max(0, integer(item.sold)) + 1;
      item.updatedAt = isoNow();
      persist();
      emitWallet(req.authUser);
      res.json({ success: true, message: "تم الشراء وإضافة العنصر إلى محفظتك", purchased: publicInventoryEntry(inventoryEntry, db.shopItems), wallet: walletPayload(req.authUser) });
    } catch (error) {
      console.error("economy purchase:", error.message);
      res.status(500).json({ error: "تعذر إكمال الشراء" });
    }
  });

  app.post("/api/economy/gifts/send", requireHttpAuth, (req, res) => {
    try {
      const db = dbState();
      ensureDefaultShopItems();
      const senderKey = req.authUser;
      const recipientMode = req.body?.recipientMode;
      if (recipientMode !== undefined && !["self", "user"].includes(recipientMode)) {
        return res.status(400).json({ error: "طريقة إرسال الهدية غير صالحة" });
      }
      const targetKey = recipientMode === "self"
        ? senderKey
        : findUserKey(db, req.body?.toUsername || req.body?.username);
      const inventoryId = clampText(req.body?.inventoryId, 160);
      const sender = db.users?.[senderKey];
      const recipient = targetKey ? db.users?.[targetKey] : null;
      if (!sender || !recipient) return res.status(404).json({ error: "المستخدم المستلم غير موجود" });
      ensureEconomyUser(sender);
      ensureEconomyUser(recipient);

      const inventoryIndex = sender.inventory.findIndex(entry => entry?.inventoryId === inventoryId);
      if (inventoryIndex < 0) return res.status(404).json({ error: "الهدية غير موجودة في محفظتك" });
      const entry = sender.inventory[inventoryIndex];
      const item = db.shopItems?.[entry.itemId] || null;
      if ((entry.type || item?.type) !== "gift") return res.status(400).json({ error: "هذا العنصر ليس هدية قابلة للإرسال" });

      sender.inventory.splice(inventoryIndex, 1);
      const charismaValue = itemCharismaValue({ ...item, ...entry }, item?.price);
      const gift = {
        giftId: randomId("gift"),
        itemId: entry.itemId,
        name: entry.name || item?.name || "هدية",
        icon: entry.icon || item?.icon || "fa-gift",
        imageUrl: entry.imageUrl || item?.imageUrl || "",
        animated: Boolean(entry.animated ?? item?.animated),
        fromUsername: senderKey,
        toUsername: targetKey,
        charismaValue,
        sentAt: isoNow()
      };
      recipient.charisma = Math.min(MAX_CHARISMA, integer(recipient.charisma) + charismaValue);
      createCharismaEntry(recipient, {
        delta: charismaValue,
        type: "gift_received",
        reason: `استلام ${gift.name} من ${senderKey}`,
        metadata: { giftId: gift.giftId, fromUsername: senderKey, charismaValue }
      });
      recipient.receivedGifts.unshift(gift);
      recipient.receivedGifts = recipient.receivedGifts.slice(0, 100);
      sender.sentGifts.unshift(gift);
      sender.sentGifts = sender.sentGifts.slice(0, 100);
      createTransaction(sender, {
        delta: 0,
        type: "gift_sent",
        reason: `إرسال ${gift.name} إلى ${targetKey}`,
        metadata: { giftId: gift.giftId, itemId: gift.itemId, toUsername: targetKey, charismaValue }
      });
      createTransaction(recipient, {
        delta: 0,
        type: "gift_received",
        reason: `استلام ${gift.name} من ${senderKey}`,
        metadata: { giftId: gift.giftId, itemId: gift.itemId, fromUsername: senderKey, charismaValue }
      });
      persist();
      emitWallet(senderKey);
      if (targetKey !== senderKey) emitWallet(targetKey);
      const recipientProfile = publicUserProfile(targetKey);
      io.emit("profile-updated", recipientProfile);
      io.to(`user_${targetKey}`).emit("gift-received", {
        gift: publicGiftTransfer(gift),
        profile: recipientProfile
      });
      res.json({
        success: true,
        message: targetKey === senderKey ? "تم إرسال الهدية إلى نفسك ورفع كارزمتك" : `تم إرسال الهدية إلى ${targetKey}`,
        gift: publicGiftTransfer(gift),
        recipient: recipientProfile,
        wallet: walletPayload(senderKey)
      });
    } catch (error) {
      console.error("economy gift send:", error.message);
      res.status(500).json({ error: "تعذر إرسال الهدية" });
    }
  });

  app.post("/api/economy/equip-frame", requireHttpAuth, (req, res) => {
    const db = dbState();
    const frameId = clampText(req.body.frameId, 120);
    const user = db.users[req.authUser];
    const frame = db.frames?.[frameId];
    const itemId = `frame_${frameId}`;
    if (!user || !frame) return res.status(404).json({ error: "الإطار غير موجود" });
    ensureEconomyUser(user);
    if (!userHasItem(user, itemId, frameId) && user.frameAssignment?.frameId !== frameId) {
      return res.status(403).json({ error: "يجب شراء الإطار أولاً" });
    }
    user.frameAssignment = {
      frameId,
      assignedBy: req.authUser,
      assignedAt: isoNow(),
      permanent: true,
      expiresAt: null,
      source: "wallet"
    };
    persist();
    const profile = publicUserProfile(req.authUser);
    io.emit("profile-updated", profile);
    res.json({ success: true, profile, wallet: walletPayload(req.authUser) });
  });

  app.post("/api/economy/unequip-frame", requireHttpAuth, (req, res) => {
    const db = dbState();
    const user = db.users[req.authUser];
    if (!user) return res.status(404).json({ error: "الحساب غير موجود" });
    delete user.frameAssignment;
    persist();
    const profile = publicUserProfile(req.authUser);
    io.emit("profile-updated", profile);
    res.json({ success: true, profile, wallet: walletPayload(req.authUser) });
  });

  app.get("/api/economy/roulette/state", requireHttpAuth, (req, res) => {
    ensureRouletteRound();
    res.json({ success: true, state: publicRouletteState(req.authUser) });
  });

  app.post("/api/economy/roulette/bet", requireHttpAuth, (req, res) => {
    const result = placeRouletteChips(req.authUser, [{ slot: req.body?.slot, denomination: req.body?.denomination }]);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/economy/roulette/repeat", requireHttpAuth, (req, res) => {
    const user = dbState().users?.[req.authUser];
    const result = placeRouletteChips(req.authUser, user?.rouletteLastBets || []);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/economy/admin/roulette-control", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const mode = ["random", "slot", "fruit_salad", "meat_salad"].includes(req.body?.mode) ? req.body.mode : null;
    const slot = integer(req.body?.slot, -1);
    if (!mode || (mode === "slot" && !rouletteSlot(slot))) return res.status(400).json({ error: "اختيار تحكم العجلة غير صالح" });
    const db = dbState();
    db.rouletteControl = { mode, slot: mode === "slot" ? slot : null, updatedAt: isoNow(), updatedBy: req.authUser };
    persist();
    broadcastRoulette("roulette:control-updated");
    res.json({ success: true, control: db.rouletteControl, state: publicRouletteState(req.authUser) });
  });

  app.post("/api/economy/roulette", requireHttpAuth, (req, res) => {
    const username = req.authUser;
    const now = Date.now();
    if (now - Number(gameRate.get(`roulette:${username}`) || 0) < 900) {
      return res.status(429).json({ error: "انتظر لحظة قبل تدوير العجلة مرة أخرى" });
    }
    gameRate.set(`roulette:${username}`, now);
    const db = dbState();
    const user = db.users[username];
    if (!user) return res.status(401).json({ error: "الحساب غير موجود" });
    ensureEconomyUser(user);
    const amount = integer(req.body.amount);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) return res.status(400).json({ error: "مبلغ الرهان غير صالح" });
    if (user.coins < amount) return res.status(400).json({ error: "رصيدك غير كافٍ" });

    const requestedSlot = integer(req.body.slot, -1);
    const legacyChoice = clampText(req.body.choice, 20).toLowerCase();
    if (requestedSlot >= ROULETTE_SLOT_COUNT) return res.status(400).json({ error: "خانة العجلة غير صالحة" });
    if (requestedSlot < 0 && !["red", "black"].includes(legacyChoice)) return res.status(400).json({ error: "اختَر خانة من العجلة" });
    user.coins -= amount;
    let result;
    let payout = 0;
    if (requestedSlot >= 0) {
      const winningSlot = crypto.randomInt(0, ROULETTE_SLOT_COUNT);
      const won = winningSlot === requestedSlot;
      createTransaction(user, {
        delta: -amount,
        type: "roulette_bet",
        reason: "رهان خانة في عجلة TOMI",
        metadata: { mode: "slot", amount, selectedSlot: requestedSlot, winningSlot, slotCount: ROULETTE_SLOT_COUNT }
      });
      if (won) {
        payout = amount * ROULETTE_WIN_MULTIPLIER;
        user.coins = Math.min(MAX_COIN_BALANCE, user.coins + payout);
        createTransaction(user, {
          delta: payout,
          type: "roulette_win",
          reason: "فوز في خانة عجلة TOMI",
          metadata: { mode: "slot", amount, selectedSlot: requestedSlot, winningSlot, payout }
        });
      }
      result = {
        mode: "slot",
        selectedSlot: requestedSlot,
        winningSlot,
        slotCount: ROULETTE_SLOT_COUNT,
        amount,
        payout,
        won,
        multiplier: ROULETTE_WIN_MULTIPLIER,
        createdAt: isoNow()
      };
    } else {
      // Keep the old red/black request format working for older clients while
      // the wallet UI uses the new exact-slot wheel.
      const choice = legacyChoice;
      const number = crypto.randomInt(0, 37);
      const color = number === 0 ? "green" : RED_NUMBERS.has(number) ? "red" : "black";
      const won = color === choice;
      createTransaction(user, { delta: -amount, type: "roulette_bet", reason: "رهان عجلة TOMI", metadata: { mode: "color", amount, choice, number, color } });
      if (won) {
        payout = amount * ROULETTE_WIN_MULTIPLIER;
        user.coins = Math.min(MAX_COIN_BALANCE, user.coins + payout);
        createTransaction(user, { delta: payout, type: "roulette_win", reason: "فوز في عجلة TOMI", metadata: { mode: "color", amount, choice, number, color, payout } });
      }
      result = { mode: "color", number, color, choice, amount, payout, won, multiplier: ROULETTE_WIN_MULTIPLIER, createdAt: isoNow() };
    }
    user.rouletteHistory.unshift(result);
    user.rouletteHistory = user.rouletteHistory.slice(0, ROULETTE_HISTORY_LIMIT);
    persist();
    emitWallet(username);
    res.json({ success: true, result, wallet: walletPayload(username) });
  });

  app.post("/api/economy/admin/grant", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const targetUser = findUserKey(db, req.body.username);
    const amount = integer(req.body.amount);
    const reason = clampText(req.body.reason || "هدية من مالك TOMI", 180);
    const user = db.users[targetUser];
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) return res.status(400).json({ error: "عدد الكوينز غير صالح" });
    ensureEconomyUser(user);
    const actual = Math.min(amount, MAX_COIN_BALANCE - user.coins);
    user.coins += actual;
    createTransaction(user, { delta: actual, type: "owner_grant", reason, metadata: { grantedBy: req.authUser } });
    persist();
    emitWallet(targetUser);
    res.json({ success: true, username: targetUser, granted: actual, wallet: walletPayload(targetUser) });
  });

  app.post("/api/economy/admin/grant-charisma", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const targetUser = findUserKey(db, req.body.username);
    const amount = integer(req.body.amount);
    const reason = clampText(req.body.reason || "كارزما من مالك TOMI", 180);
    const user = db.users[targetUser];
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_CHARISMA) return res.status(400).json({ error: `عدد الكارزما يجب أن يكون بين 1 و${MAX_CHARISMA.toLocaleString("en-US")}` });
    ensureEconomyUser(user);
    const actual = Math.min(amount, MAX_CHARISMA - user.charisma);
    user.charisma += actual;
    createCharismaEntry(user, {
      delta: actual,
      type: "owner_grant",
      reason,
      metadata: { grantedBy: req.authUser }
    });
    persist();
    const profile = publicUserProfile(targetUser);
    emitWallet(targetUser);
    io.emit("profile-updated", profile);
    res.json({ success: true, username: targetUser, granted: actual, charisma: publicCharisma(user), profile });
  });

  app.post("/api/economy/admin/withdraw", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const targetUser = findUserKey(db, req.body?.username);
    const user = db.users?.[targetUser];
    const asset = req.body?.asset;
    const amount = integer(req.body?.amount);
    const reason = clampText(req.body?.reason || "سحب بواسطة مالك TOMI", 180);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (!["coins", "charisma"].includes(asset)) return res.status(400).json({ error: "اختر الكوينز أو الكارزما" });
    const maximum = asset === "coins" ? MAX_COIN_BALANCE : MAX_CHARISMA;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) {
      return res.status(400).json({ error: `المبلغ يجب أن يكون بين 1 و${maximum.toLocaleString("en-US")}` });
    }
    ensureEconomyUser(user);
    const balance = asset === "coins" ? user.coins : user.charisma;
    if (amount > balance) return res.status(400).json({ error: `رصيد المستخدم الحالي ${balance.toLocaleString("en-US")} فقط` });

    if (asset === "coins") {
      user.coins -= amount;
      createTransaction(user, {
        delta: -amount,
        type: "owner_withdraw",
        reason,
        metadata: { withdrawnBy: req.authUser, asset }
      });
    } else {
      user.charisma -= amount;
      createCharismaEntry(user, {
        delta: -amount,
        type: "owner_withdraw",
        reason,
        metadata: { withdrawnBy: req.authUser, asset }
      });
    }

    persist();
    const profile = asset === "charisma" ? publicUserProfile(targetUser) : null;
    emitWallet(targetUser);
    if (profile) io.emit("profile-updated", profile);
    res.json({
      success: true,
      username: targetUser,
      asset,
      withdrawn: amount,
      balance: asset === "coins" ? user.coins : publicCharisma(user).points,
      wallet: walletPayload(targetUser),
      charisma: asset === "charisma" ? publicCharisma(user) : undefined
    });
  });

  app.post("/api/economy/admin/reset-password", authLimiter, requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const targetUser = clampText(req.body.username, 40);
    const newPassword = String(req.body.newPassword || "");
    const user = db.users[targetUser];
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (targetUser === PLATFORM_OWNER_USERNAME) return res.status(400).json({ error: "لا يمكن تغيير كلمة مرور المالك من هذه الخانة" });
    const validation = validatePassword(newPassword);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    user.password = hashPassword(newPassword);
    user.passwordChangedAt = isoNow();
    user.passwordResetByOwnerAt = isoNow();
    for (const [token, session] of Object.entries(db.sessions || {})) {
      if (session?.username === targetUser) delete db.sessions[token];
    }
    persist();
    io.to(`user_${targetUser}`).emit("owner-password-reset", { message: "تمت إعادة ضبط كلمة مرور حسابك من مالك المنصة" });
    res.json({ success: true, message: "تمت إعادة ضبط كلمة المرور وإخراج الجلسات القديمة" });
  });

  app.get("/api/economy/admin/items", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    res.json({ success: true, items: ensureDefaultShopItems().map(publicItem) });
  });

  app.post("/api/economy/admin/items", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const type = ["frame", "gift", "username", "badge", "custom"].includes(req.body.type) ? req.body.type : "custom";
    const name = clampText(req.body.name, 80);
    const price = integer(req.body.price);
    if (!name || !Number.isSafeInteger(price) || price < 0 || price > 10_000_000) return res.status(400).json({ error: "بيانات العنصر غير صالحة" });
    const frameId = clampText(req.body.frameId, 120);
    if (type === "frame" && !db.frames?.[frameId]) return res.status(400).json({ error: "اختر إطارًا موجودًا" });
    const item = {
      itemId: randomId("item"),
      type,
      name,
      description: clampText(req.body.description, 240),
      price,
      icon: clampText(req.body.icon || "fa-gift", 50),
      charismaValue: type === "gift" ? Math.max(1, Math.min(1_000_000, integer(req.body.charismaValue, Math.max(1, Math.ceil(price / 5))))) : 0,
      imageUrl: clampText(req.body.imageUrl, 500),
      frameId: type === "frame" ? frameId : null,
      frameUrl: type === "frame" ? (db.frames[frameId].url || "") : "",
      animated: type === "frame" ? Boolean(db.frames[frameId].animated) : Boolean(req.body.animated),
      metadata: req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
      active: true,
      sold: 0,
      createdBy: req.authUser,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    db.shopItems[item.itemId] = item;
    persist();
    res.json({ success: true, item: publicItem(item) });
  });

  app.patch("/api/economy/admin/items/:itemId", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const item = db.shopItems[req.params.itemId];
    if (!item) return res.status(404).json({ error: "العنصر غير موجود" });
    if (req.body.name !== undefined) item.name = clampText(req.body.name, 80) || item.name;
    if (req.body.description !== undefined) item.description = clampText(req.body.description, 240);
    if (req.body.icon !== undefined) item.icon = clampText(req.body.icon || "fa-gift", 50) || "fa-gift";
    if (req.body.imageUrl !== undefined) item.imageUrl = clampText(req.body.imageUrl, 500);
    if (req.body.animated !== undefined) item.animated = Boolean(req.body.animated);
    if (req.body.price !== undefined) item.price = Math.max(0, Math.min(10_000_000, integer(req.body.price, item.price)));
    if (req.body.charismaValue !== undefined && item.type === "gift") item.charismaValue = Math.max(1, Math.min(1_000_000, integer(req.body.charismaValue, item.charismaValue || 1)));
    if (req.body.active !== undefined) item.active = Boolean(req.body.active);
    if (req.body.stock !== undefined) item.stock = req.body.stock === null || req.body.stock === "" ? null : Math.max(0, integer(req.body.stock));
    item.updatedAt = isoNow();
    persist();
    res.json({ success: true, item: publicItem(item) });
  });

  app.delete("/api/economy/admin/items/:itemId", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    const item = db.shopItems[req.params.itemId];
    if (!item) return res.status(404).json({ error: "العنصر غير موجود" });
    item.active = false;
    item.updatedAt = isoNow();
    persist();
    res.json({ success: true });
  });

  app.get("/api/games/catalog", requireHttpAuth, (_req, res) => {
    res.json({ success: true, games: Object.values(GAME_SPECS) });
  });

  app.get("/api/games/rooms", requireHttpAuth, (_req, res) => {
    res.json({ success: true, rooms: listGameRooms(dbState()) });
  });

  app.get("/api/games/invites", requireHttpAuth, (req, res) => {
    const db = dbState();
    const now = Date.now();
    const invites = (Array.isArray(db.gameInvites?.[req.authUser]) ? db.gameInvites[req.authUser] : [])
      .filter(invite => Date.parse(invite?.expiresAt || "") > now && db.gameRooms?.[invite.roomId])
      .map(invite => ({ ...invite, room: publicGameRoom(db.gameRooms[invite.roomId], db) }))
      .slice(-20);
    res.json({ success: true, invites });
  });

  function playerProfile(username, db) {
    const profile = publicUserProfile(username) || { username, displayName: username, avatar: "", frame: null };
    return { ...profile, username, isOnline: activeOnlineUsers?.has(username) || false };
  }

  function publicGameRoom(room, db) {
    if (!room) return null;
    const spec = GAME_SPECS[room.gameType] || GAME_SPECS.number_battle;
    return {
      roomId: room.roomId,
      name: room.name,
      gameType: room.gameType,
      gameName: spec.name,
      gameIcon: spec.icon,
      action: spec.action,
      actionLabel: spec.actionLabel,
      choices: Array.isArray(spec.choices) ? spec.choices : null,
      maxValue: Math.max(1, integer(spec.maxValue, 100)),
      randomChoice: Boolean(spec.randomChoice),
      owner: room.owner,
      maxPlayers: room.maxPlayers,
      status: room.status,
      round: room.round,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players: (room.players || []).map(username => ({
        ...playerProfile(username, db),
        ready: Boolean(room.actions?.[username])
      })),
      lastResult: room.lastResult || null,
      bannedUsers: []
    };
  }

  function listGameRooms(db) {
    return Object.values(db.gameRooms || {})
      .filter(room => room && Array.isArray(room.players) && room.players.length)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))
      .slice(0, 100)
      .map(room => publicGameRoom(room, db));
  }

  function emitGameRooms() {
    io.emit("game:rooms", listGameRooms(dbState()));
  }

  function emitGameState(roomId) {
    const db = dbState();
    const room = db.gameRooms?.[roomId];
    if (room) io.to(`game_${roomId}`).emit("game:state", publicGameRoom(room, db));
    emitGameRooms();
  }

  function gameActor(socket) {
    const username = socket.userId || socket.sessionUser;
    const db = dbState();
    return username && db.users?.[username] ? username : null;
  }

  function gameError(socket, error) {
    socket.emit("game:error", { error });
  }

  function removeInvite(db, username, roomId) {
    const list = Array.isArray(db.gameInvites?.[username]) ? db.gameInvites[username] : [];
    const next = list.filter(invite => invite?.roomId !== roomId);
    if (next.length) db.gameInvites[username] = next;
    else delete db.gameInvites[username];
  }

  function roomSpec(room) {
    return GAME_SPECS[room?.gameType] || null;
  }

  function resolveGameRound(room, db) {
    const spec = roomSpec(room);
    if (!spec || room.players.length < 2) return null;
    if (!room.players.every(username => room.actions?.[username])) return null;

    const values = Object.fromEntries(room.players.map(username => [username, room.actions[username].value]));
    let winners = [];
    let winningChoice = null;
    if (spec.randomChoice && Array.isArray(spec.choices) && spec.choices.length) {
      winningChoice = spec.choices[crypto.randomInt(0, spec.choices.length)];
      winners = room.players.filter(username => values[username] === winningChoice);
    } else if (spec.action === "roll" || spec.action === "number") {
      const high = Math.max(...Object.values(values).map(value => integer(value)));
      winners = room.players.filter(username => integer(values[username]) === high);
    } else {
      const distinct = [...new Set(Object.values(values))];
      if (distinct.length === 1 || distinct.length === 3) winners = room.players;
      else {
        const winningChoice = distinct.find(choice => distinct.every(other => choice === other || RPS_BEATS[choice] === other));
        winners = room.players.filter(username => values[username] === winningChoice);
      }
    }
    const result = {
      round: room.round,
      winners,
      values,
      winningChoice,
      tied: winners.length !== 1,
      createdAt: isoNow()
    };
    room.lastResult = result;
    room.round = integer(room.round, 1) + 1;
    room.actions = {};
    room.status = "ready";
    room.updatedAt = isoNow();
    return result;
  }

  function registerGameSocketHandlers(socket) {
    registerRouletteSocketHandlers(socket);
    if (socket.__tomiEconomyGamesRegistered) return;
    socket.__tomiEconomyGamesRegistered = true;

    socket.on("game:list", () => socket.emit("game:rooms", listGameRooms(dbState())));
    socket.on("game:get-invites", () => {
      const actor = gameActor(socket);
      if (!actor) return;
      const db = dbState();
      const now = Date.now();
      const invites = (Array.isArray(db.gameInvites?.[actor]) ? db.gameInvites[actor] : []).filter(invite => Date.parse(invite?.expiresAt || "") > now && db.gameRooms?.[invite.roomId]);
      db.gameInvites[actor] = invites;
      socket.emit("game:invites", invites.map(invite => ({ ...invite, room: publicGameRoom(db.gameRooms[invite.roomId], db) })));
    });

    socket.on("game:create-room", ({ gameType, maxPlayers, name } = {}) => {
      const actor = gameActor(socket);
      if (!actor) return gameError(socket, "يجب تسجيل الدخول أولاً");
      const db = dbState();
      const spec = GAME_SPECS[gameType] || GAME_SPECS.number_battle;
      const capacity = integer(maxPlayers, spec.allowedPlayers[0]);
      if (!spec.allowedPlayers.includes(capacity)) return gameError(socket, "عدد اللاعبين غير متاح لهذه اللعبة");
      const roomId = randomId("game");
      db.gameRooms[roomId] = {
        roomId,
        gameType: spec.id,
        name: clampText(name || spec.name, 70) || spec.name,
        owner: actor,
        maxPlayers: capacity,
        players: [actor],
        actions: {},
        round: 1,
        status: "waiting",
        lastResult: null,
        createdAt: isoNow(),
        updatedAt: isoNow()
      };
      persist();
      socket.join(`game_${roomId}`);
      socket.emit("game:created", publicGameRoom(db.gameRooms[roomId], db));
      emitGameState(roomId);
    });

    socket.on("game:join-room", ({ roomId } = {}) => {
      const actor = gameActor(socket);
      if (!actor) return gameError(socket, "يجب تسجيل الدخول أولاً");
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      if (!room) return gameError(socket, "غرفة اللعبة غير موجودة");
      if (Array.isArray(room.bannedUsers) && room.bannedUsers.includes(actor)) return gameError(socket, "تم منعك من هذه الغرفة");
      if (!room.players.includes(actor) && room.players.length >= room.maxPlayers) return gameError(socket, "الغرفة ممتلئة");
      if (!room.players.includes(actor)) room.players.push(actor);
      room.status = room.players.length >= 2 ? "ready" : "waiting";
      room.updatedAt = isoNow();
      removeInvite(db, actor, room.roomId);
      persist();
      socket.join(`game_${room.roomId}`);
      emitGameState(room.roomId);
    });

    socket.on("game:leave-room", ({ roomId } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      if (!actor || !room || !room.players.includes(actor)) return;
      room.players = room.players.filter(username => username !== actor);
      delete room.actions?.[actor];
      socket.leave(`game_${room.roomId}`);
      if (room.owner === actor) room.owner = room.players[0] || null;
      if (!room.players.length) delete db.gameRooms[room.roomId];
      else { room.status = room.players.length >= 2 ? "ready" : "waiting"; room.updatedAt = isoNow(); }
      persist();
      socket.emit("game:left", { roomId: room.roomId });
      if (db.gameRooms[room.roomId]) emitGameState(room.roomId); else emitGameRooms();
    });

    socket.on("game:action", ({ roomId, value, choice } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const spec = roomSpec(room);
      if (!actor || !room || !spec || !room.players.includes(actor)) return gameError(socket, "لا تملك صلاحية اللعب في هذه الغرفة");
      if (room.players.length < 2) return gameError(socket, "انتظر انضمام لاعب آخر");
      if (room.actions?.[actor]) return gameError(socket, "أرسلت اختيارك لهذه الجولة بالفعل");
      let cleanValue;
      if (spec.action === "roll") cleanValue = crypto.randomInt(1, 7);
      if (spec.action === "number") {
        cleanValue = integer(value);
        const maxValue = Math.max(1, integer(spec.maxValue, 100));
        if (cleanValue < 1 || cleanValue > maxValue) return gameError(socket, `اختر رقمًا بين 1 و${maxValue}`);
      }
      if (spec.action === "choice") {
        cleanValue = clampText(choice || value, 10);
        if (!Array.isArray(spec.choices) || !spec.choices.includes(cleanValue)) return gameError(socket, "الاختيار غير صالح");
      }
      room.actions[actor] = { value: cleanValue, at: isoNow() };
      room.status = "playing";
      room.updatedAt = isoNow();
      socket.emit("game:action-result", { roomId: room.roomId, gameType: room.gameType, value: cleanValue, round: room.round });
      const result = resolveGameRound(room, db);
      persist();
      emitGameState(room.roomId);
      if (result) io.to(`game_${room.roomId}`).emit("game:round-result", result);
    });

    socket.on("game:invite", ({ roomId, targetUser } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const target = clampText(targetUser, 40);
      if (!actor || !room || !room.players.includes(actor)) return gameError(socket, "لا تملك صلاحية دعوة اللاعبين");
      if (!db.users?.[target] || target === actor) return gameError(socket, "المستخدم غير صالح");
      if (room.players.length >= room.maxPlayers) return gameError(socket, "الغرفة ممتلئة");
      if (!Array.isArray(db.gameInvites[target])) db.gameInvites[target] = [];
      const invite = { id: randomId("ginv"), roomId: room.roomId, invitedBy: actor, createdAt: isoNow(), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
      db.gameInvites[target] = [...db.gameInvites[target].filter(item => item?.roomId !== room.roomId), invite].slice(-20);
      persist();
      io.to(`user_${target}`).emit("game:invite", { ...invite, room: publicGameRoom(room, db), inviter: publicUserProfile(actor) });
      socket.emit("game:invite-sent", { success: true, targetUser: target });
    });

    socket.on("game:kick", ({ roomId, targetUser } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const target = clampText(targetUser, 40);
      if (!actor || !room || room.owner !== actor) return gameError(socket, "المالك فقط يستطيع طرد لاعب من غرفة اللعبة");
      if (!room.players.includes(target) || target === actor) return gameError(socket, "اللاعب غير موجود");
      room.players = room.players.filter(username => username !== target);
      delete room.actions?.[target];
      room.updatedAt = isoNow();
      room.status = room.players.length >= 2 ? "ready" : "waiting";
      persist();
      io.to(`user_${target}`).emit("game:kicked", { roomId: room.roomId, message: "تم إخراجك من غرفة اللعبة" });
      emitGameState(room.roomId);
    });

    socket.on("game:report", ({ roomId, targetUser, reason } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const target = clampText(targetUser, 40);
      const cleanReason = clampText(reason || "إساءة داخل لعبة", 500);
      if (!actor || !room || !room.players.includes(actor) || !room.players.includes(target) || actor === target) return gameError(socket, "بيانات البلاغ غير صالحة");
      const reportId = randomId("report");
      db.reports[reportId] = {
        reportId,
        category: "game",
        status: "pending",
        reporter: actor,
        targetUser: target,
        roomId: room.roomId,
        reason: cleanReason,
        details: cleanReason,
        createdAt: isoNow()
      };
      persist();
      emitToStaffWithPermission?.("manage_reports", "new-report", db.reports[reportId]);
      socket.emit("game:report-result", { success: true, message: "تم إرسال البلاغ إلى إدارة TOMI" });
    });
  }

  function claimDailyForUser(username) {
    const wallet = walletPayload(username, { claimDaily: true });
    return wallet?.daily || { claimed: false, amount: 0, available: false };
  }

  ensureRouletteRound();
  return { registerGameSocketHandlers, claimDailyForUser };
}

module.exports = {
  registerEconomyGames,
  GAME_SPECS,
  DAILY_COIN_REWARD,
  publicCharisma,
  CHARISMA_LEVELS,
  ROULETTE_SLOT_COUNT,
  ROULETTE_SLOTS,
  ROULETTE_DENOMINATIONS,
  ROULETTE_HISTORY_LIMIT,
  ROULETTE_DAILY_PRIZES
};
