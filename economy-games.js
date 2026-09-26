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
const KING_GIFT_ITEM_ID = "gift_king";
const KING_GIFT_LUCKY_REWARD_ID = "gift_king_lucky_reward";
const GAME_ENTRY_FEES = Object.freeze([80, 100, 200]);
const GAME_PLATFORM_COMMISSION = 20;

// Gift returns are rolled independently for every gift, including gifts sent
// in one batch. The last band is the only band eligible to match King Gift's
// mystery number (10% of attempts).
const GIFT_RETURN_BANDS = Object.freeze([
  { min: 1, max: 100, probability: 0.60 },
  { min: 101, max: 150, probability: 0.30 },
  { min: 151, max: 300, probability: 0.10 }
]);

function giftMysteryEligibleMin(price) {
  const cappedPrice = Math.max(1, Math.min(300, integer(price, 300)));
  return Math.min(cappedPrice, Math.max(1, Math.floor(cappedPrice / 2) + 1));
}

function randomKingMysteryRange(item) {
  const price = Math.max(1, Math.min(300, integer(item?.price, 300)));
  const minAllowed = giftMysteryEligibleMin(price);
  const span = Math.max(0, price - minAllowed);
  if (span === 0) return { min: price, max: price };
  // Keep the public window useful but never reveal a value outside the 10%
  // eligible high-return band.
  const width = Math.min(span, Math.max(1, Math.min(80, Math.floor(price / 3))));
  const min = crypto.randomInt(minAllowed, price - width + 2);
  const minMax = Math.min(price, min + Math.max(1, Math.floor(width / 2)));
  const max = crypto.randomInt(minMax, price + 1);
  return { min, max };
}

function rotateKingMystery(item) {
  if (!item || item.itemId !== KING_GIFT_ITEM_ID) return null;
  const range = randomKingMysteryRange(item);
  item.kingMysteryRangeMin = range.min;
  item.kingMysteryRangeMax = range.max;
  item.kingSecretNumber = crypto.randomInt(range.min, range.max + 1);
  item.updatedAt = isoNow();
  return range;
}

function ensureKingMysteryState(item) {
  if (!item || item.itemId !== KING_GIFT_ITEM_ID) return null;
  const price = Math.max(1, Math.min(300, integer(item.price, 300)));
  let min = integer(item.kingMysteryRangeMin, 0);
  let max = integer(item.kingMysteryRangeMax, 0);
  const eligibleMin = giftMysteryEligibleMin(price);
  if (min < eligibleMin || max < min || max > price) {
    const range = randomKingMysteryRange(item);
    min = range.min;
    max = range.max;
    item.kingMysteryRangeMin = min;
    item.kingMysteryRangeMax = max;
  }
  const secret = integer(item.kingSecretNumber, 0);
  if (secret < min || secret > max) item.kingSecretNumber = crypto.randomInt(min, max + 1);
  return { min, max };
}

function rollGiftReturn(price) {
  const cappedPrice = Math.max(0, integer(price, 0));
  if (!cappedPrice) return { amount: 0, highBand: false, band: null };
  const draw = crypto.randomInt(0, 10_000) / 10_000;
  const band = draw < 0.60 ? GIFT_RETURN_BANDS[0] : draw < 0.90 ? GIFT_RETURN_BANDS[1] : GIFT_RETURN_BANDS[2];
  const min = Math.min(band.min, cappedPrice);
  const max = Math.min(band.max, cappedPrice);
  return {
    amount: crypto.randomInt(min, max + 1),
    highBand: band === GIFT_RETURN_BANDS[2],
    band: { min, max, probability: band.probability }
  };
}

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
  },
  quiz: {
    id: "quiz",
    name: "تحدي الأسئلة",
    description: "أسئلة عشوائية بين 2 و8 لاعبين، بجولات محددة ونقاط متراكمة.",
    icon: "fa-circle-question",
    action: "quiz",
    advanced: "quiz",
    allowedPlayers: [2, 3, 4, 5, 6, 7, 8],
    actionLabel: "اختَر الإجابة",
    roundTimeMs: 15_000,
    roundOptions: [3, 5, 10, 15, 20]
  },
  snakes_ladders: {
    id: "snakes_ladders",
    name: "السلم والأفعى",
    description: "ارمِ النرد واصعد السلالم، لكن انتبه من الأفاعي.",
    icon: "fa-stairs",
    action: "roll",
    advanced: "snakes_ladders",
    allowedPlayers: [2, 3, 4],
    actionLabel: "ارمِ النرد",
    turnTimeMs: 30_000
  },
  dominoes: {
    id: "dominoes",
    name: "دومنة",
    description: "دومنة TOMI بين لاعبين أو أربعة لاعبين مع سحب وتمرير ذكي.",
    icon: "fa-table-cells-large",
    action: "domino",
    advanced: "dominoes",
    allowedPlayers: [2, 4],
    actionLabel: "ضع حجر الدومنة",
    turnTimeMs: 30_000
  },
  uno: {
    id: "uno",
    name: "UNO",
    description: "لعبة UNO سريعة بين 2 و8 لاعبين مع بطاقات خاصة وتزامن مباشر.",
    icon: "fa-layer-group",
    action: "uno",
    advanced: "uno",
    allowedPlayers: [2, 3, 4, 5, 6, 7, 8],
    actionLabel: "العب البطاقة",
    turnTimeMs: 30_000
  },
  jackaroo: {
    id: "jackaroo",
    name: "توميرو",
    description: "توميرو بين لاعبين أو أربعة لاعبين، مع كرات وبطاقات خاصة.",
    icon: "fa-chess-board",
    action: "jackaroo",
    advanced: "jackaroo",
    allowedPlayers: [2, 4],
    actionLabel: "العب البطاقة",
    turnTimeMs: 15_000
  }
});

const QUIZ_ROUND_TIME_MS = 15_000;
const QUIZ_RESULT_TIME_MS = 3_500;
const QUIZ_DEFAULT_ROUNDS = 10;
const QUIZ_MIN_ROUNDS = 3;
const QUIZ_MAX_ROUNDS = 30;
const SNAKES_TURN_TIME_MS = 30_000;
const SNAKES_BOARD_SIZE = 100;
const DOMINO_TURN_TIME_MS = 30_000;
const DOMINO_HAND_SIZE = 7;
const DOMINO_MAX_PIP = 6;
const UNO_TURN_TIME_MS = 30_000;
const UNO_HAND_SIZE = 7;
const UNO_COLORS = Object.freeze(["red", "yellow", "green", "blue"]);
const UNO_COLOR_LABELS = Object.freeze({ red: "أحمر", yellow: "أصفر", green: "أخضر", blue: "أزرق" });
const UNO_COLOR_HEX = Object.freeze({ red: "#ef476f", yellow: "#f8c537", green: "#18b77a", blue: "#3f8cff" });
const JACKAROO_TURN_TIME_MS = 15_000;
const JACKAROO_HAND_SIZE = 4;
const JACKAROO_BOARD_SIZE = 52;
const JACKAROO_HOME_PROGRESS = 52;
const JACKAROO_SUITS = Object.freeze(["hearts", "diamonds", "clubs", "spades"]);
const JACKAROO_SUIT_LABELS = Object.freeze({ hearts: "قلوب", diamonds: "ماس", clubs: "نوادي", spades: "بستوني" });
const JACKAROO_SUIT_SYMBOLS = Object.freeze({ hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" });
const JACKAROO_RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
const JACKAROO_CARD_MOVES = Object.freeze({ A: 1, 2: 2, 3: 3, 4: -4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 });
const SNAKES_LADDERS = Object.freeze({
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78
});

// Resolve a jump only after the dice movement has landed on the visible
// ladder bottom or snake head. Keeping this in one helper prevents the public
// board, animation payload, and authoritative position from drifting apart.
function resolveSnakesJump(cell) {
  const from = integer(cell, 0);
  const destination = Number(SNAKES_LADDERS[String(from)]);
  return Number.isSafeInteger(destination) && destination >= 1 && destination <= SNAKES_BOARD_SIZE && destination !== from
    ? destination
    : null;
}

// Questions stay on the server so clients cannot inspect the answer before
// submitting. The bank is intentionally mixed and can later be moved to an
// owner-managed MongoDB collection without changing the room protocol.
const QUIZ_QUESTIONS = Object.freeze([
  { id: "iq-capital", category: "عام", question: "ما عاصمة العراق؟", options: ["بغداد", "البصرة", "الموصل", "أربيل"], answer: 0 },
  { id: "planet-red", category: "علوم", question: "أي كوكب يُعرف بالكوكب الأحمر؟", options: ["الزهرة", "المريخ", "المشتري", "عطارد"], answer: 1 },
  { id: "water-formula", category: "علوم", question: "ما الصيغة الكيميائية للماء؟", options: ["CO2", "O2", "H2O", "NaCl"], answer: 2 },
  { id: "week-days", category: "معلومات", question: "كم عدد أيام الأسبوع؟", options: ["5", "6", "7", "8"], answer: 2 },
  { id: "largest-ocean", category: "جغرافية", question: "ما أكبر محيط على الأرض؟", options: ["الأطلسي", "الهندي", "المتجمد", "الهادئ"], answer: 3 },
  { id: "arabic-letters", category: "لغة", question: "كم عدد حروف اللغة العربية؟", options: ["26", "28", "29", "30"], answer: 1 },
  { id: "light-speed", category: "علوم", question: "أيٌّ من الآتي أسرع؟", options: ["الصوت", "الضوء", "الرياح", "السيارة"], answer: 1 },
  { id: "iraq-river", category: "جغرافية", question: "أي نهر يمر بمدينة بغداد؟", options: ["دجلة", "النيل", "الفرات فقط", "الأردن"], answer: 0 },
  { id: "month-days", category: "معلومات", question: "كم يوماً يكون الشهر غالباً؟", options: ["20", "28 أو 29 أو 30 أو 31", "35", "40"], answer: 1 },
  { id: "first-number", category: "رياضيات", question: "ما أول عدد أولي؟", options: ["0", "1", "2", "3"], answer: 2 },
  { id: "continents", category: "جغرافية", question: "كم عدد قارات العالم؟", options: ["5", "6", "7", "8"], answer: 2 },
  { id: "cpu", category: "تقنية", question: "ما وظيفة المعالج في الحاسوب؟", options: ["تنفيذ التعليمات", "طباعة الأوراق", "تخزين الكهرباء", "تبريد الشاشة"], answer: 0 },
  { id: "html", category: "تقنية", question: "ما الذي تُستخدم له HTML غالباً؟", options: ["بناء هيكل الصفحة", "تشفير القرص", "إدارة الشبكة", "ضغط الفيديو"], answer: 0 },
  { id: "triangle", category: "رياضيات", question: "كم ضلعاً للمثلث؟", options: ["2", "3", "4", "5"], answer: 1 },
  { id: "sun", category: "علوم", question: "الشمس تُعد ماذا؟", options: ["كوكباً", "قمراً", "نجماً", "مذنباً"], answer: 2 },
  { id: "iraq-currency", category: "معلومات", question: "ما عملة العراق؟", options: ["الدينار العراقي", "الريال", "الليرة", "الدرهم"], answer: 0 },
  { id: "square", category: "رياضيات", question: "كم زاوية قائمة للمربع؟", options: ["2", "3", "4", "5"], answer: 2 },
  { id: "web-protocol", category: "تقنية", question: "ما البروتوكول المستخدم غالباً لتصفح المواقع؟", options: ["HTTP", "FTP فقط", "SMTP", "GPS"], answer: 0 },
  { id: "largest-land", category: "جغرافية", question: "ما أكبر قارة من حيث المساحة؟", options: ["أفريقيا", "آسيا", "أوروبا", "أستراليا"], answer: 1 },
  { id: "healthy", category: "معلومات", question: "أي خيار يُعد عادةً مصدراً جيداً للألياف؟", options: ["الخضراوات", "الماء فقط", "السكر", "الملح"], answer: 0 }
]);

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

function normalizeQuizRounds(value) {
  return Math.max(QUIZ_MIN_ROUNDS, Math.min(QUIZ_MAX_ROUNDS, integer(value, QUIZ_DEFAULT_ROUNDS)));
}

function clampText(value, max = 120) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function quizQuestionForPublic(question) {
  if (!question) return null;
  return {
    id: question.id,
    category: question.category,
    question: question.question,
    options: Array.isArray(question.options) ? question.options.slice() : []
  };
}

function quizScoreMap(room) {
  const scores = room?.quiz?.scores && typeof room.quiz.scores === "object" ? room.quiz.scores : {};
  return Object.fromEntries((room?.players || []).map(username => [username, Math.max(0, integer(scores[username], 0))]));
}

function quizFinalRanking(room) {
  const scores = quizScoreMap(room);
  return (room?.players || []).map(username => ({
    username,
    score: Number(scores[username] || 0)
  })).sort((a, b) => b.score - a.score || String(a.username).localeCompare(String(b.username)));
}

function snakesPositions(room) {
  const positions = room?.snakes?.positions && typeof room.snakes.positions === "object" ? room.snakes.positions : {};
  return Object.fromEntries((room?.players || []).map(username => [username, Math.max(1, Math.min(SNAKES_BOARD_SIZE, integer(positions[username], 1)))]));
}

function dominoTilePublic(tile) {
  if (!tile || !Number.isInteger(Number(tile.a)) || !Number.isInteger(Number(tile.b))) return null;
  const a = Math.max(0, Math.min(DOMINO_MAX_PIP, integer(tile.a, 0)));
  const b = Math.max(0, Math.min(DOMINO_MAX_PIP, integer(tile.b, 0)));
  return { id: String(tile.id || `${a}-${b}`), a, b };
}

function dominoTilePips(tile) {
  return Math.max(0, integer(tile?.a, 0)) + Math.max(0, integer(tile?.b, 0));
}

function createDominoTiles() {
  const tiles = [];
  for (let a = 0; a <= DOMINO_MAX_PIP; a += 1) {
    for (let b = a; b <= DOMINO_MAX_PIP; b += 1) {
      tiles.push({ id: `${a}-${b}`, a, b });
    }
  }
  return tiles;
}

function shuffledDominoTiles() {
  const tiles = createDominoTiles();
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
  }
  return tiles;
}

function dominoTileSides(tile, leftEnd, rightEnd) {
  if (!tile) return [];
  const sides = [];
  if (leftEnd == null || tile.a === leftEnd || tile.b === leftEnd) sides.push("left");
  if (rightEnd == null || tile.a === rightEnd || tile.b === rightEnd) sides.push("right");
  return sides;
}

function dominoLegalMoves(room, username) {
  const state = room?.domino;
  const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
  if (!state || room?.status !== "playing" || room.players?.[integer(state.currentTurn, 0)] !== username) return [];
  return hand.flatMap(tile => dominoTileSides(tile, state.leftEnd, state.rightEnd).map(side => ({ tile, side })));
}

function dominoHandPips(room) {
  const state = room?.domino;
  return Object.fromEntries((room?.players || []).map(username => [
    username,
    (Array.isArray(state?.hands?.[username]) ? state.hands[username] : []).reduce((total, tile) => total + dominoTilePips(tile), 0)
  ]));
}

function unoCardPublic(card) {
  if (!card || !card.id) return null;
  return {
    id: String(card.id),
    color: UNO_COLORS.includes(card.color) ? card.color : "wild",
    kind: String(card.kind || "number"),
    value: Number.isInteger(card.value) ? card.value : null,
    label: String(card.label || card.kind || "")
  };
}

function unoCardPoints(card) {
  if (!card) return 0;
  if (card.kind === "number") return Math.max(0, integer(card.value, 0));
  if (["wild", "wild_draw4"].includes(card.kind)) return 50;
  return 20;
}

function createUnoDeck() {
  const deck = [];
  const add = (color, kind, value, copy, label) => deck.push({ id: `${color}-${kind}-${value ?? "x"}-${copy}`, color, kind, value, label });
  for (const color of UNO_COLORS) {
    add(color, "number", 0, 0, "0");
    for (let value = 1; value <= 9; value += 1) {
      add(color, "number", value, 0, String(value));
      add(color, "number", value, 1, String(value));
    }
    for (const kind of ["skip", "reverse", "draw2"]) {
      const label = kind === "skip" ? "skip" : kind === "reverse" ? "reverse" : "draw2";
      add(color, kind, null, 0, label);
      add(color, kind, null, 1, label);
    }
  }
  for (let copy = 0; copy < 4; copy += 1) {
    add("wild", "wild", null, copy, "wild");
    add("wild", "wild_draw4", null, copy, "wild_draw4");
  }
  return deck;
}

function shuffledUnoDeck() {
  const deck = createUnoDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function unoCardCanPlay(card, state, hand = []) {
  if (!card || !state || state.pendingDraw > 0) return false;
  const top = state.discard?.[state.discard.length - 1] || null;
  if (card.kind === "wild") return true;
  if (card.kind === "wild_draw4") {
    return !hand.some(other => other.color === state.currentColor && other.color !== "wild");
  }
  const sameColor = card.color !== "wild" && card.color === state.currentColor;
  const sameNumber = card.kind === "number"
    && top?.kind === "number"
    && Number(card.value) === Number(top.value);
  const actionKinds = new Set(["skip", "reverse", "draw2"]);
  const sameAction = top?.color !== "wild"
    && actionKinds.has(card.kind)
    && card.kind === top?.kind;
  return Boolean(sameColor || sameNumber || sameAction);
}

function unoLegalCards(room, username) {
  const state = room?.uno;
  const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
  if (!state || room?.status !== "playing" || room.players?.[integer(state.currentTurn, 0)] !== username || state.pendingDraw > 0) return [];
  return hand.filter(card => unoCardCanPlay(card, state, hand));
}

function unoHandPoints(room) {
  const state = room?.uno;
  return Object.fromEntries((room?.players || []).map(username => [
    username,
    (Array.isArray(state?.hands?.[username]) ? state.hands[username] : []).reduce((total, card) => total + unoCardPoints(card), 0)
  ]));
}

function jackarooCardPublic(card) {
  if (!card || !card.id || !JACKAROO_SUITS.includes(card.suit) || !JACKAROO_RANKS.includes(card.rank)) return null;
  return {
    id: String(card.id),
    suit: card.suit,
    suitLabel: JACKAROO_SUIT_LABELS[card.suit] || card.suit,
    symbol: JACKAROO_SUIT_SYMBOLS[card.suit] || "",
    rank: card.rank,
    label: `${card.rank}${JACKAROO_SUIT_SYMBOLS[card.suit] || ""}`
  };
}

function createJackarooDeck() {
  const deck = [];
  for (const suit of JACKAROO_SUITS) {
    for (const rank of JACKAROO_RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

function shuffledJackarooDeck() {
  const deck = createJackarooDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function jackarooCardMove(card) {
  return JACKAROO_CARD_MOVES[card?.rank] ?? null;
}

function jackarooTeamFor(room, username) {
  if (room?.jackaroo?.teams?.team1?.includes(username)) return "team1";
  if (room?.jackaroo?.teams?.team2?.includes(username)) return "team2";
  return null;
}

function jackarooPlayerIndex(room, username) {
  if (!Array.isArray(room?.players)) return -1;
  const index = room.players.indexOf(username);
  if (index < 0) return -1;
  // With two players, place them opposite each other on the 52-cell track
  // (0 and 26). Four-player games keep the original quartered layout.
  return room.players.length === 2 ? index * 2 : index;
}

function jackarooCellFor(room, username, progress) {
  const numericProgress = integer(progress, -1);
  if (numericProgress < 0 || numericProgress >= JACKAROO_HOME_PROGRESS) return null;
  const index = jackarooPlayerIndex(room, username);
  if (index < 0) return null;
  return (index * (JACKAROO_BOARD_SIZE / 4) + numericProgress) % JACKAROO_BOARD_SIZE;
}

function jackarooLegalMoves(room, username) {
  const state = room?.jackaroo;
  const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
  if (!state || room?.status !== "playing" || room.players?.[integer(state.currentTurn, 0)] !== username) return [];
  const marbles = Array.isArray(state.marbles?.[username]) ? state.marbles[username] : [];
  const moves = [];
  for (const card of hand) {
    const steps = jackarooCardMove(card);
    if (steps == null) continue;
    for (const marble of marbles) {
      const progress = integer(marble.progress, -1);
      if (progress === JACKAROO_HOME_PROGRESS) continue;
      if (progress < 0) {
        if (["A", "K"].includes(card.rank)) {
          moves.push({ card, marbleId: marble.id, mode: "start", steps: 1, from: -1, to: 0 });
        }
        continue;
      }
      const next = progress + steps;
      if (next < 0 || next > JACKAROO_HOME_PROGRESS) continue;
      moves.push({ card, marbleId: marble.id, mode: next === JACKAROO_HOME_PROGRESS ? "home" : "move", steps, from: progress, to: next });
    }
  }
  return moves;
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
  if (!db.giftStats || typeof db.giftStats !== "object" || Array.isArray(db.giftStats)) {
    db.giftStats = {};
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
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    charismaValue: item.type === "gift" ? Math.max(1, integer(item.charismaValue, Math.max(1, Math.ceil(integer(item.price) / 5)))) : 0,
    stock: item.stock == null ? null : Math.max(0, integer(item.stock)),
    sold: Math.max(0, integer(item.sold)),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

// Gift jackpot totals are intentionally public, while the King Gift's secret
// number is kept on the server-only item record and is never included here.
function publicShopItem(item, db, { includeAdmin = false } = {}) {
  const result = publicItem(item);
  if (!result) return null;
  if (item.type === "gift") {
    const stats = db?.giftStats?.[item.itemId] || {};
    result.jackpotAmount = Math.max(0, integer(stats.coinsSpent, 0));
    result.jackpotPurchases = Math.max(0, integer(stats.purchases, 0));
    result.jackpotUpdatedAt = stats.updatedAt || null;
    result.jackpotLastWonAt = stats.lastWonAt || null;
    if (item.itemId === KING_GIFT_ITEM_ID) {
      const range = ensureKingMysteryState(item) || { min: 151, max: 300 };
      // Only the range is public; the exact server-side number stays secret.
      result.mysteryRange = { min: range.min, max: range.max };
      result.mysteryChancePercent = 10;
    }
  }
  if (includeAdmin && item.itemId === KING_GIFT_ITEM_ID) {
    // This field is sent only from the owner-only admin endpoint.
    result.kingSecretNumber = Math.max(1, integer(item.kingSecretNumber, 1));
  }
  return result;
}

function publicInventoryEntry(entry, items) {
  const item = items?.[entry?.itemId] || null;
  return {
    inventoryId: entry?.inventoryId || "",
    itemId: entry?.itemId || "",
    type: entry?.type || item?.type || "custom",
    name: entry?.name || item?.name || "عنصر",
    description: entry?.description || item?.description || "",
    price: Math.max(0, integer(entry?.price ?? item?.price, 0)),
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
    sentAt: entry?.sentAt || null,
    price: Math.max(0, integer(entry?.price, 0)),
    metadata: entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
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
  let advancedGamesTimer = null;

  function dbState() {
    const db = getDb();
    ensureEconomyState(db);
    return db;
  }

  function normalizeGameEntryFee(value) {
    const fee = integer(value, GAME_ENTRY_FEES[0]);
    return GAME_ENTRY_FEES.includes(fee) ? fee : GAME_ENTRY_FEES[0];
  }

  function chargeCoinsForVideo(username, amount = 2_000, metadata = {}) {
    const db = dbState();
    const user = db.users?.[username];
    const cost = Math.max(0, integer(amount, 0));
    if (!user) return { ok: false, error: "المستخدم غير موجود" };
    ensureEconomyUser(user);
    if (integer(user.coins, 0) < cost) {
      return {
        ok: false,
        error: `ما عندك كوينز كافية. تحتاج ${cost.toLocaleString("en-US")} كوينز للجودة العالية`,
        code: "INSUFFICIENT_COINS"
      };
    }
    if (cost > 0) {
      user.coins -= cost;
      const mediaLabel = String(metadata?.fileType || '').toLowerCase() === 'image'
        ? 'الصورة'
        : (String(metadata?.fileType || '').toLowerCase() === 'gif' ? 'الصورة المتحركة' : 'الفيديو');
      createTransaction(user, {
        delta: -cost,
        type: "video_quality_fee",
        reason: `رفع ${mediaLabel} بجودة عالية`,
        metadata: { ...metadata, cost }
      });
    }
    persist();
    emitWallet(username);
    return { ok: true, amount: cost, balance: user.coins };
  }

  function refundCoins(username, amount, metadata = {}) {
    const db = dbState();
    const user = db.users?.[username];
    const value = Math.max(0, integer(amount, 0));
    if (!user || value <= 0) return { ok: false };
    ensureEconomyUser(user);
    const credited = Math.min(value, Math.max(0, MAX_COIN_BALANCE - integer(user.coins, 0)));
    if (!credited) return { ok: false };
    user.coins += credited;
    createTransaction(user, {
      delta: credited,
      type: "video_quality_refund",
      reason: "إرجاع رسوم رفع الفيديو",
      metadata: { ...metadata, amount: credited }
    });
    persist();
    emitWallet(username);
    return { ok: true, amount: credited, balance: user.coins };
  }

  function collectGameEntryFees(room) {
    if (!room || !Array.isArray(room.players) || room.players.length < 2) {
      return { ok: false, error: "تحتاج اللعبة إلى لاعبين على الأقل" };
    }
    if (room.fee?.collected && !room.fee?.settled) return { ok: true, fee: room.fee };
    const entryFee = normalizeGameEntryFee(room.entryFee);
    const players = [...new Set(room.players.filter(Boolean))];
    const db = dbState();
    const missing = players.find(username => !db.users?.[username]);
    if (missing) return { ok: false, error: "أحد اللاعبين لم يعد متاحاً" };
    const unable = players.find(username => integer(db.users[username].coins, 0) < entryFee);
    if (unable) {
      return { ok: false, error: `اللاعب ${unable} لا يملك ${entryFee.toLocaleString("en-US")} كوينز لبدء اللعبة` };
    }
    const collectedAt = isoNow();
    players.forEach(username => {
      const user = db.users[username];
      ensureEconomyUser(user);
      user.coins -= entryFee;
      createTransaction(user, {
        delta: -entryFee,
        type: "game_entry_fee",
        reason: `رسوم دخول لعبة ${room.name || room.gameType}`,
        metadata: { roomId: room.roomId, gameType: room.gameType, entryFee }
      });
    });
    room.fee = {
      collected: true,
      settled: false,
      entryFee,
      players,
      totalPot: entryFee * players.length,
      commission: 0,
      prizePool: 0,
      payouts: [],
      collectedAt,
      settledAt: null
    };
    persist();
    players.forEach(emitWallet);
    return { ok: true, fee: room.fee };
  }

  function settleGameEntryFees(room, winnerList) {
    if (!room?.fee?.collected || room.fee.settled) return room?.fee?.settled ? room.fee : null;
    const db = dbState();
    const players = Array.isArray(room.fee.players) ? room.fee.players : room.players || [];
    const winners = [...new Set((Array.isArray(winnerList) ? winnerList : []).filter(username => players.includes(username)))];
    if (!winners.length) return null;
    const totalPot = Math.max(0, integer(room.fee.totalPot, normalizeGameEntryFee(room.entryFee) * players.length));
    const commission = Math.min(GAME_PLATFORM_COMMISSION, totalPot);
    const prizePool = Math.max(0, totalPot - commission);
    const base = Math.floor(prizePool / winners.length);
    let remainder = prizePool - (base * winners.length);
    const payouts = winners.map(username => {
      const payout = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      const user = db.users?.[username];
      if (user && payout > 0) {
        ensureEconomyUser(user);
        user.coins = Math.min(MAX_COIN_BALANCE, integer(user.coins, 0) + payout);
        createTransaction(user, {
          delta: payout,
          type: "game_prize",
          reason: `جائزة الفوز في ${room.name || room.gameType}`,
          metadata: { roomId: room.roomId, gameType: room.gameType, totalPot, commission, payout }
        });
      }
      return { username, amount: payout };
    });
    room.fee = {
      ...room.fee,
      settled: true,
      winners,
      totalPot,
      commission,
      prizePool,
      payouts,
      settledAt: isoNow()
    };
    persist();
    winners.forEach(emitWallet);
    return room.fee;
  }

  function isAdvancedRoom(room) {
    return room?.gameType === "quiz" || room?.gameType === "snakes_ladders" || room?.gameType === "dominoes" || room?.gameType === "uno" || room?.gameType === "jackaroo";
  }

  function resetAdvancedRoom(room, { keepRoster = true } = {}) {
    if (!room || !isAdvancedRoom(room)) return;
    room.quiz = null;
    room.snakes = null;
    room.domino = null;
    room.uno = null;
    room.jackaroo = null;
    room.lastResult = null;
    room.fee = null;
    room.round = 1;
    room.status = keepRoster && room.players.length >= 2 ? "ready" : "waiting";
    room.updatedAt = isoNow();
  }

  function startDominoRound(room) {
    if (!room || room.gameType !== "dominoes" || !Array.isArray(room.players) || ![2, 4].includes(room.players.length)) return false;
    const deck = shuffledDominoTiles();
    const hands = Object.fromEntries(room.players.map(username => [username, deck.splice(0, DOMINO_HAND_SIZE)]));
    let starterIndex = 0;
    let starterTile = null;
    let bestScore = -1;
    room.players.forEach((username, playerIndex) => {
      for (const tile of hands[username]) {
        const score = tile.a === tile.b ? 100 + tile.a : tile.a + tile.b;
        if (score > bestScore) {
          bestScore = score;
          starterIndex = playerIndex;
          starterTile = tile;
        }
      }
    });
    if (!starterTile) return false;
    const starterHand = hands[room.players[starterIndex]];
    const starterTileIndex = starterHand.findIndex(tile => tile.id === starterTile.id);
    starterHand.splice(starterTileIndex, 1);
    const firstTile = { ...starterTile };
    room.domino = {
      hands,
      boneyard: deck,
      board: [firstTile],
      leftEnd: firstTile.a,
      rightEnd: firstTile.b,
      currentTurn: (starterIndex + 1) % room.players.length,
      turnDeadlineAt: Date.now() + DOMINO_TURN_TIME_MS,
      lastMove: {
        type: "start",
        player: room.players[starterIndex],
        tile: dominoTilePublic(firstTile),
        automatic: true,
        createdAt: isoNow()
      },
      winner: null,
      winners: [],
      passStreak: 0,
      scores: Object.fromEntries(room.players.map(username => [username, 0]))
    };
    room.lastResult = null;
    room.round = 1;
    room.status = "playing";
    room.updatedAt = isoNow();
    return true;
  }

  function finishDominoRound(room, { blocked = false, winner = null } = {}) {
    const state = room?.domino;
    if (!room || room.gameType !== "dominoes" || !state || room.status !== "playing") return null;
    const handPips = dominoHandPips(room);
    const winners = winner
      ? [winner]
      : (() => {
        const lowest = Math.min(...room.players.map(username => handPips[username]));
        return room.players.filter(username => handPips[username] === lowest);
      })();
    const primaryWinner = winners[0] || null;
    const awardPool = primaryWinner
      ? room.players.filter(username => !winners.includes(username)).reduce((total, username) => total + handPips[username], 0)
      : 0;
    const award = winners.length ? Math.floor(awardPool / winners.length) : 0;
    winners.forEach(username => {
      state.scores[username] = Math.max(0, integer(state.scores?.[username], 0)) + award;
    });
    state.winner = primaryWinner;
    state.winners = winners;
    state.turnDeadlineAt = null;
    state.passStreak = 0;
    const result = {
      gameType: "dominoes",
      type: blocked ? "blocked" : "winner",
      round: room.round,
      winner: primaryWinner,
      winners,
      award,
      handPips,
      scores: Object.fromEntries(room.players.map(username => [username, Math.max(0, integer(state.scores?.[username], 0))])),
      createdAt: isoNow()
    };
    result.entryFee = settleGameEntryFees(room, winners);
    room.lastResult = result;
    room.round = integer(room.round, 1) + 1;
    room.status = "finished";
    room.updatedAt = isoNow();
    return result;
  }

  function advanceDominoTurn(room, actor) {
    const state = room.domino;
    const currentIndex = Math.max(0, Math.min(room.players.length - 1, integer(state.currentTurn, 0)));
    state.passStreak = Math.max(0, integer(state.passStreak, 0)) + 1;
    if (state.passStreak >= room.players.length) return finishDominoRound(room, { blocked: true });
    state.currentTurn = (currentIndex + 1) % room.players.length;
    state.turnDeadlineAt = Date.now() + DOMINO_TURN_TIME_MS;
    state.lastMove = {
      type: "pass",
      player: actor,
      automatic: false,
      createdAt: isoNow()
    };
    room.updatedAt = isoNow();
    return state.lastMove;
  }

  function orientDominoTile(tile, side, leftEnd, rightEnd) {
    if (side === "left") {
      return tile.a === leftEnd ? { ...tile, a: tile.b, b: tile.a } : { ...tile };
    }
    return tile.a === rightEnd ? { ...tile } : { ...tile, a: tile.b, b: tile.a };
  }

  function applyDominoAction(room, actor, { action, tileId, side, automatic = false } = {}) {
    const state = room?.domino;
    if (!room || room.gameType !== "dominoes" || room.status !== "playing" || !state) return { ok: false, error: "لا توجد جولة دومنة مفتوحة حالياً" };
    const currentIndex = Math.max(0, Math.min(room.players.length - 1, integer(state.currentTurn, 0)));
    const expected = room.players[currentIndex];
    if (actor !== expected) return { ok: false, error: "انتظر دورك في الدومنة" };
    const hand = Array.isArray(state.hands?.[actor]) ? state.hands[actor] : [];
    const legalMoves = dominoLegalMoves(room, actor);
    if (action === "play") {
      const tileIndex = hand.findIndex(tile => String(tile.id) === String(tileId));
      if (tileIndex < 0) return { ok: false, error: "هذا الحجر غير موجود في يدك" };
      const tile = hand[tileIndex];
      const sides = dominoTileSides(tile, state.leftEnd, state.rightEnd);
      const selectedSide = sides.includes(side) ? side : (automatic ? sides[0] : null);
      if (!selectedSide) return { ok: false, error: "لا يمكن وضع هذا الحجر على الجهة المختارة" };
      const oriented = orientDominoTile(tile, selectedSide, state.leftEnd, state.rightEnd);
      hand.splice(tileIndex, 1);
      if (selectedSide === "left") {
        state.board.unshift(oriented);
        state.leftEnd = oriented.a;
      } else {
        state.board.push(oriented);
        state.rightEnd = oriented.b;
      }
      state.passStreak = 0;
      state.lastMove = {
        type: "play",
        player: actor,
        tile: dominoTilePublic(oriented),
        side: selectedSide,
        automatic: Boolean(automatic),
        createdAt: isoNow()
      };
      if (!hand.length) {
        const result = finishDominoRound(room, { winner: actor });
        return { ok: true, result: result || state.lastMove };
      }
      state.currentTurn = (currentIndex + 1) % room.players.length;
      state.turnDeadlineAt = Date.now() + DOMINO_TURN_TIME_MS;
      room.updatedAt = isoNow();
      return { ok: true, result: state.lastMove };
    }
    if (action === "draw") {
      if (legalMoves.length) return { ok: false, error: "لديك حجر قابل للعب؛ اختره أولاً" };
      if (state.boneyard.length) {
        const drawn = state.boneyard.shift();
        hand.push(drawn);
        state.lastMove = { type: "draw", player: actor, tile: dominoTilePublic(drawn), automatic: Boolean(automatic), createdAt: isoNow() };
        state.turnDeadlineAt = Date.now() + DOMINO_TURN_TIME_MS;
        if (!dominoLegalMoves(room, actor).length && !state.boneyard.length) {
          const passResult = advanceDominoTurn(room, actor);
          return { ok: true, result: passResult || state.lastMove };
        }
        room.updatedAt = isoNow();
        return { ok: true, result: state.lastMove };
      }
      if (dominoLegalMoves(room, actor).length) return { ok: false, error: "لديك حجر قابل للعب؛ اختره أولاً" };
      const passResult = advanceDominoTurn(room, actor);
      return { ok: true, result: passResult || state.lastMove };
    }
    if (action === "pass") {
      if (legalMoves.length) return { ok: false, error: "لا يمكنك التمرير ما دام لديك حجر صالح" };
      if (state.boneyard.length) return { ok: false, error: "اسحب حجراً من المخزون أولاً" };
      const passResult = advanceDominoTurn(room, actor);
      return { ok: true, result: passResult || state.lastMove };
    }
    return { ok: false, error: "حركة الدومنة غير صالحة" };
  }

  function dominoAutomaticAction(room) {
    const actor = room.players[Math.max(0, Math.min(room.players.length - 1, integer(room.domino?.currentTurn, 0)))];
    const moves = dominoLegalMoves(room, actor);
    if (moves.length) return applyDominoAction(room, actor, { action: "play", tileId: moves[0].tile.id, side: moves[0].side, automatic: true });
    if (room.domino?.boneyard?.length) return applyDominoAction(room, actor, { action: "draw", automatic: true });
    return applyDominoAction(room, actor, { action: "pass", automatic: true });
  }

  function refillUnoDeck(state) {
    if (!state || state.deck.length || state.discard.length <= 1) return;
    const top = state.discard.pop();
    const refill = state.discard.splice(0);
    for (let index = refill.length - 1; index > 0; index -= 1) {
      const swapIndex = crypto.randomInt(0, index + 1);
      [refill[index], refill[swapIndex]] = [refill[swapIndex], refill[index]];
    }
    state.deck = refill;
    state.discard = [top];
  }

  function drawUnoCards(state, count) {
    const drawn = [];
    for (let index = 0; index < count; index += 1) {
      refillUnoDeck(state);
      if (!state.deck.length) break;
      drawn.push(state.deck.shift());
    }
    return drawn;
  }

  function startUnoRound(room) {
    if (!room || room.gameType !== "uno" || !Array.isArray(room.players) || room.players.length < 2 || room.players.length > 8) return false;
    const previousScores = room.uno?.scores && typeof room.uno.scores === "object" ? room.uno.scores : {};
    const deck = shuffledUnoDeck();
    const hands = Object.fromEntries(room.players.map(username => [username, deck.splice(0, UNO_HAND_SIZE)]));
    const firstIndex = Math.max(0, deck.findIndex(card => card.kind === "number"));
    const firstCard = deck.splice(firstIndex, 1)[0] || deck.shift();
    if (!firstCard) return false;
    room.uno = {
      deck,
      discard: [firstCard],
      hands,
      currentTurn: crypto.randomInt(0, room.players.length),
      direction: 1,
      currentColor: firstCard.color,
      pendingDraw: 0,
      turnDeadlineAt: Date.now() + UNO_TURN_TIME_MS,
      lastMove: { type: "start", card: unoCardPublic(firstCard), automatic: true, createdAt: isoNow() },
      winner: null,
      scores: Object.fromEntries(room.players.map(username => [username, Math.max(0, integer(previousScores[username], 0))])),
      unoCalled: {}
    };
    room.lastResult = null;
    room.round = 1;
    room.status = "playing";
    room.updatedAt = isoNow();
    return true;
  }

  function advanceUnoTurn(room, steps = 1) {
    const state = room.uno;
    const length = room.players.length;
    const current = Math.max(0, Math.min(length - 1, integer(state.currentTurn, 0)));
    const direction = state.direction === -1 ? -1 : 1;
    state.currentTurn = ((current + direction * steps) % length + length) % length;
    state.turnDeadlineAt = Date.now() + UNO_TURN_TIME_MS;
  }

  function finishUnoRound(room, winner) {
    const state = room?.uno;
    if (!room || room.gameType !== "uno" || !state || room.status !== "playing" || !winner) return null;
    const handPoints = unoHandPoints(room);
    const award = room.players.filter(username => username !== winner).reduce((total, username) => total + handPoints[username], 0);
    state.scores[winner] = Math.max(0, integer(state.scores?.[winner], 0)) + award;
    state.winner = winner;
    state.turnDeadlineAt = null;
    const result = {
      gameType: "uno",
      type: "winner",
      round: room.round,
      winner,
      award,
      handPoints,
      scores: Object.fromEntries(room.players.map(username => [username, Math.max(0, integer(state.scores?.[username], 0))])),
      createdAt: isoNow()
    };
    result.entryFee = settleGameEntryFees(room, [winner]);
    room.lastResult = result;
    room.round = integer(room.round, 1) + 1;
    room.status = "finished";
    room.updatedAt = isoNow();
    return result;
  }

  function bestUnoColor(hand) {
    const counts = Object.fromEntries(UNO_COLORS.map(color => [color, 0]));
    for (const card of hand || []) if (counts[card.color] !== undefined) counts[card.color] += 1;
    return UNO_COLORS.slice().sort((a, b) => counts[b] - counts[a])[0] || UNO_COLORS[0];
  }

  function applyUnoAction(room, actor, { action, cardId, chosenColor, automatic = false } = {}) {
    const state = room?.uno;
    if (!room || room.gameType !== "uno" || room.status !== "playing" || !state) return { ok: false, error: "لا توجد جولة UNO مفتوحة حالياً" };
    const currentIndex = Math.max(0, Math.min(room.players.length - 1, integer(state.currentTurn, 0)));
    const hand = Array.isArray(state.hands?.[actor]) ? state.hands[actor] : [];
    if (action === "uno") {
      if (hand.length !== 1 || state.lastMove?.type !== "play" || state.lastMove?.player !== actor) return { ok: false, error: "اضغط UNO مباشرة بعد أن يبقى عندك كرت واحد" };
      state.unoCalled[actor] = true;
      state.lastMove = { type: "uno", player: actor, automatic: Boolean(automatic), createdAt: isoNow() };
      room.updatedAt = isoNow();
      return { ok: true, result: state.lastMove };
    }
    if (room.players[currentIndex] !== actor) return { ok: false, error: "انتظر دورك في UNO" };
    if (state.pendingDraw > 0) {
      if (action !== "draw") return { ok: false, error: `اسحب ${state.pendingDraw} بطاقات العقوبة أولاً` };
      const amount = state.pendingDraw;
      const drawn = drawUnoCards(state, amount);
      hand.push(...drawn);
      state.pendingDraw = 0;
      state.lastMove = { type: "penalty", player: actor, amount: drawn.length, automatic: Boolean(automatic), createdAt: isoNow() };
      advanceUnoTurn(room);
      room.updatedAt = isoNow();
      return { ok: true, result: state.lastMove };
    }
    if (action === "draw") {
      const legal = unoLegalCards(room, actor);
      if (legal.length) return { ok: false, error: "لديك بطاقة صالحة؛ العبها أولاً" };
      const drawn = drawUnoCards(state, 1);
      if (!drawn.length) {
        advanceUnoTurn(room);
        state.lastMove = { type: "pass", player: actor, automatic: Boolean(automatic), createdAt: isoNow() };
        room.updatedAt = isoNow();
        return { ok: true, result: state.lastMove };
      }
      hand.push(drawn[0]);
      state.lastMove = { type: "draw", player: actor, amount: 1, automatic: Boolean(automatic), createdAt: isoNow() };
      const canPlayDrawn = unoCardCanPlay(drawn[0], state, hand);
      if (!canPlayDrawn) advanceUnoTurn(room);
      else state.turnDeadlineAt = Date.now() + UNO_TURN_TIME_MS;
      room.updatedAt = isoNow();
      return { ok: true, result: state.lastMove };
    }
    if (action !== "play") return { ok: false, error: "حركة UNO غير صالحة" };
    const index = hand.findIndex(card => String(card.id) === String(cardId));
    if (index < 0) return { ok: false, error: "هذه البطاقة غير موجودة في يدك" };
    const card = hand[index];
    if (!unoCardCanPlay(card, state, hand)) return { ok: false, error: "لا يمكن لعب هذه البطاقة حالياً" };
    let nextColor = card.color;
    if (["wild", "wild_draw4"].includes(card.kind)) {
      if (!UNO_COLORS.includes(chosenColor)) return { ok: false, error: "اختَر لوناً بعد لعب البطاقة البرية" };
      nextColor = chosenColor;
    }
    hand.splice(index, 1);
    state.discard.push(card);
    state.currentColor = nextColor;
    state.pendingDraw = card.kind === "draw2" ? 2 : card.kind === "wild_draw4" ? 4 : 0;
    state.unoCalled[actor] = false;
    state.lastMove = {
      type: "play",
      player: actor,
      card: unoCardPublic(card),
      chosenColor: nextColor,
      automatic: Boolean(automatic),
      createdAt: isoNow()
    };
    if (!hand.length) {
      const result = finishUnoRound(room, actor);
      return { ok: true, result: result || state.lastMove };
    }
    if (card.kind === "reverse") {
      state.direction *= -1;
      advanceUnoTurn(room, room.players.length === 2 ? 2 : 1);
    } else if (card.kind === "skip") {
      advanceUnoTurn(room, 2);
    } else {
      advanceUnoTurn(room, 1);
    }
    room.updatedAt = isoNow();
    return { ok: true, result: state.lastMove };
  }

  function unoAutomaticAction(room) {
    const actor = room.players[Math.max(0, Math.min(room.players.length - 1, integer(room.uno?.currentTurn, 0)))];
    if (room.uno?.pendingDraw > 0) return applyUnoAction(room, actor, { action: "draw", automatic: true });
    const legal = unoLegalCards(room, actor);
    if (legal.length) {
      const card = legal[0];
      return applyUnoAction(room, actor, {
        action: "play",
        cardId: card.id,
        chosenColor: ["wild", "wild_draw4"].includes(card.kind) ? bestUnoColor(room.uno.hands[actor]) : undefined,
        automatic: true
      });
    }
    return applyUnoAction(room, actor, { action: "draw", automatic: true });
  }

  function refillJackarooDeck(state) {
    if (!state || state.deck.length || !Array.isArray(state.discard) || !state.discard.length) return;
    state.deck = state.discard.splice(0);
    for (let index = state.deck.length - 1; index > 0; index -= 1) {
      const swapIndex = crypto.randomInt(0, index + 1);
      [state.deck[index], state.deck[swapIndex]] = [state.deck[swapIndex], state.deck[index]];
    }
  }

  function drawJackarooCards(state, count) {
    const cards = [];
    for (let index = 0; index < count; index += 1) {
      refillJackarooDeck(state);
      if (!state.deck.length) break;
      cards.push(state.deck.shift());
    }
    return cards;
  }

  function dealJackarooHands(room) {
    const state = room?.jackaroo;
    if (!state) return;
    for (const username of room.players) {
      const hand = Array.isArray(state.hands?.[username]) ? state.hands[username] : (state.hands[username] = []);
      hand.push(...drawJackarooCards(state, JACKAROO_HAND_SIZE));
    }
  }

  function startJackarooRound(room) {
    if (!room || room.gameType !== "jackaroo" || !Array.isArray(room.players) || ![2, 4].includes(room.players.length)) return false;
    const previousScores = room.jackaroo?.scores && typeof room.jackaroo.scores === "object" ? room.jackaroo.scores : {};
    const deck = shuffledJackarooDeck();
    const hands = Object.fromEntries(room.players.map(username => [username, deck.splice(0, JACKAROO_HAND_SIZE)]));
    const teams = room.players.length === 2
      ? {
          team1: [room.players[0]],
          team2: [room.players[1]]
        }
      : {
          team1: [room.players[0], room.players[2]],
          team2: [room.players[1], room.players[3]]
        };
    const marbles = Object.fromEntries(room.players.map(username => [username, Array.from({ length: 4 }, (_, index) => ({ id: `m${index + 1}`, progress: -1 }))]));
    room.jackaroo = {
      deck,
      discard: [],
      hands,
      marbles,
      teams,
      currentTurn: crypto.randomInt(0, room.players.length),
      turnDeadlineAt: Date.now() + JACKAROO_TURN_TIME_MS,
      lastMove: { type: "start", automatic: true, createdAt: isoNow() },
      winnerTeam: null,
      winnerPlayers: [],
      scores: { team1: Math.max(0, integer(previousScores.team1, 0)), team2: Math.max(0, integer(previousScores.team2, 0)) }
    };
    room.lastResult = null;
    room.round = 1;
    room.status = "playing";
    room.updatedAt = isoNow();
    return true;
  }

  function jackarooTeamComplete(room, team) {
    const state = room?.jackaroo;
    const players = state?.teams?.[team] || [];
    const expectedPlayers = room?.players?.length === 2 ? 1 : 2;
    return players.length === expectedPlayers && players.every(username => (state.marbles?.[username] || []).every(marble => integer(marble.progress, -1) === JACKAROO_HOME_PROGRESS));
  }

  function finishJackarooRound(room, winnerTeam) {
    const state = room?.jackaroo;
    if (!room || room.gameType !== "jackaroo" || room.status !== "playing" || !state || !winnerTeam) return null;
    state.winnerTeam = winnerTeam;
    state.winnerPlayers = Array.isArray(state.teams?.[winnerTeam]) ? state.teams[winnerTeam].slice() : [];
    state.scores[winnerTeam] = Math.max(0, integer(state.scores?.[winnerTeam], 0)) + 1;
    state.turnDeadlineAt = null;
    const result = {
      gameType: "jackaroo",
      type: "winner",
      round: room.round,
      winnerTeam,
      winners: state.winnerPlayers,
      scores: { team1: Math.max(0, integer(state.scores?.team1, 0)), team2: Math.max(0, integer(state.scores?.team2, 0)) },
      createdAt: isoNow()
    };
    result.entryFee = settleGameEntryFees(room, state.winnerPlayers);
    room.lastResult = result;
    room.round = integer(room.round, 1) + 1;
    room.status = "finished";
    room.updatedAt = isoNow();
    return result;
  }

  function advanceJackarooTurn(room) {
    const state = room.jackaroo;
    const length = room.players.length;
    const current = Math.max(0, Math.min(length - 1, integer(state.currentTurn, 0)));
    state.currentTurn = (current + 1) % length;
    state.turnDeadlineAt = Date.now() + JACKAROO_TURN_TIME_MS;
  }

  function applyJackarooAction(room, actor, { action, cardId, marbleId, automatic = false } = {}) {
    const state = room?.jackaroo;
    if (!room || room.gameType !== "jackaroo" || room.status !== "playing" || !state) return { ok: false, error: "لا توجد جولة توميرو مفتوحة حالياً" };
    if (![2, 4].includes(room.players.length)) return { ok: false, error: "توميرو تحتاج لاعبين أو أربعة لاعبين" };
    const currentIndex = Math.max(0, Math.min(room.players.length - 1, integer(state.currentTurn, 0)));
    if (room.players[currentIndex] !== actor) return { ok: false, error: "انتظر دورك في توميرو" };
    const hand = Array.isArray(state.hands?.[actor]) ? state.hands[actor] : [];
    const legal = jackarooLegalMoves(room, actor);
    if (action === "pass") {
      if (legal.length) return { ok: false, error: "لديك حركة صالحة؛ اختر بطاقة وحجرًا" };
      if (!hand.length) {
        dealJackarooHands(room);
        advanceJackarooTurn(room);
        return { ok: true, result: state.lastMove };
      }
      const discardIndex = hand.findIndex(card => String(card.id) === String(cardId));
      const removed = hand.splice(discardIndex >= 0 ? discardIndex : 0, 1)[0];
      state.discard.push(removed);
      state.lastMove = { type: "pass", player: actor, card: jackarooCardPublic(removed), automatic: Boolean(automatic), createdAt: isoNow() };
      if (room.players.every(username => !state.hands[username]?.length)) dealJackarooHands(room);
      advanceJackarooTurn(room);
      room.updatedAt = isoNow();
      return { ok: true, result: state.lastMove };
    }
    if (action !== "play") return { ok: false, error: "حركة توميرو غير صالحة" };
    const cardIndex = hand.findIndex(card => String(card.id) === String(cardId));
    const card = cardIndex >= 0 ? hand[cardIndex] : null;
    const matching = legal.find(move => String(move.card.id) === String(cardId) && String(move.marbleId) === String(marbleId));
    const selected = matching || (automatic ? legal[0] : null);
    if (!card || !selected) return { ok: false, error: "اختر بطاقة وحجرًا يمكن تحريكهما" };
    const marble = state.marbles?.[actor]?.find(item => item.id === selected.marbleId);
    if (!marble) return { ok: false, error: "الحجر غير موجود" };
    const before = integer(marble.progress, -1);
    marble.progress = integer(selected.to, before);
    hand.splice(cardIndex, 1);
    state.discard.push(card);
    const captured = [];
    const targetCell = jackarooCellFor(room, actor, marble.progress);
    if (targetCell != null && marble.progress < JACKAROO_HOME_PROGRESS) {
      for (const username of room.players) {
        if (jackarooTeamFor(room, username) === jackarooTeamFor(room, actor)) continue;
        for (const opponent of state.marbles?.[username] || []) {
          if (opponent.progress >= 0 && opponent.progress < JACKAROO_HOME_PROGRESS && jackarooCellFor(room, username, opponent.progress) === targetCell) {
            opponent.progress = -1;
            captured.push({ username, marbleId: opponent.id });
          }
        }
      }
    }
    state.lastMove = {
      type: "play",
      player: actor,
      card: jackarooCardPublic(card),
      marbleId: marble.id,
      mode: selected.mode,
      from: before,
      to: marble.progress,
      cell: targetCell,
      captured,
      automatic: Boolean(automatic),
      createdAt: isoNow()
    };
    const team = jackarooTeamFor(room, actor);
    if (team && jackarooTeamComplete(room, team)) {
      const result = finishJackarooRound(room, team);
      return { ok: true, result: result || state.lastMove };
    }
    if (room.players.every(username => !state.hands[username]?.length)) dealJackarooHands(room);
    advanceJackarooTurn(room);
    room.updatedAt = isoNow();
    return { ok: true, result: state.lastMove };
  }

  function jackarooAutomaticAction(room) {
    const actor = room.players[Math.max(0, Math.min(room.players.length - 1, integer(room.jackaroo?.currentTurn, 0)))];
    const legal = jackarooLegalMoves(room, actor);
    if (legal.length) {
      const move = legal[0];
      return applyJackarooAction(room, actor, { action: "play", cardId: move.card.id, marbleId: move.marbleId, automatic: true });
    }
    const card = room.jackaroo?.hands?.[actor]?.[0];
    return applyJackarooAction(room, actor, { action: "pass", cardId: card?.id, automatic: true });
  }

  function startQuizRound(room, { resetScores = false } = {}) {
    if (!room || room.gameType !== "quiz" || room.players.length < 2) return false;
    const totalRounds = normalizeQuizRounds(room.quizRounds);
    if (!room.quiz || typeof room.quiz !== "object" || resetScores) {
      room.quiz = { usedQuestionIds: [], scores: {}, answers: {}, current: null, deadlineAt: null, nextRoundAt: null, totalRounds };
    }
    room.quiz.totalRounds = totalRounds;
    if (resetScores) room.round = 1;
    const used = new Set(Array.isArray(room.quiz.usedQuestionIds) ? room.quiz.usedQuestionIds : []);
    let available = QUIZ_QUESTIONS.filter(question => !used.has(question.id));
    if (!available.length) {
      used.clear();
      available = QUIZ_QUESTIONS.slice();
    }
    const question = available[crypto.randomInt(0, available.length)];
    used.add(question.id);
    room.quiz.usedQuestionIds = [...used].slice(-QUIZ_QUESTIONS.length);
    room.quiz.scores = Object.fromEntries(room.players.map(username => [
      username,
      Math.max(0, integer(room.quiz.scores?.[username], 0))
    ]));
    room.quiz.answers = {};
    room.quiz.current = question;
    room.quiz.roundStartedAt = Date.now();
    room.quiz.deadlineAt = Date.now() + QUIZ_ROUND_TIME_MS;
    room.quiz.nextRoundAt = null;
    room.lastResult = null;
    room.status = "playing";
    room.updatedAt = isoNow();
    return true;
  }

  function finishQuizRound(room, { timedOut = false } = {}) {
    if (!room || room.gameType !== "quiz" || room.status !== "playing" || !room.quiz?.current) return null;
    const question = room.quiz.current;
    const answers = room.quiz.answers && typeof room.quiz.answers === "object" ? room.quiz.answers : {};
    if (!room.quiz.scores || typeof room.quiz.scores !== "object") room.quiz.scores = {};
    const elapsed = Math.max(0, Date.now() - Number(room.quiz.roundStartedAt || Date.now()));
    const entries = room.players.map(username => {
      const hasAnswer = Object.prototype.hasOwnProperty.call(answers, username);
      const answer = hasAnswer ? integer(answers[username], -1) : null;
      const correct = answer === question.answer;
      const secondsLeft = Math.max(0, Math.ceil((QUIZ_ROUND_TIME_MS - elapsed) / 1000));
      const points = correct ? 100 + Math.min(30, secondsLeft * 2) : 0;
      if (points) room.quiz.scores[username] = Math.max(0, integer(room.quiz.scores[username], 0)) + points;
      return { username, answer, correct, points, answered: hasAnswer };
    });
    const roundWinners = entries.filter(entry => entry.correct).map(entry => entry.username);
    const scores = quizScoreMap(room);
    const totalRounds = normalizeQuizRounds(room.quizRounds || room.quiz.totalRounds);
    const finalRound = Number(room.round || 1) >= totalRounds;
    const finalRankings = quizFinalRanking(room);
    const highestScore = finalRankings[0]?.score ?? 0;
    const finalWinners = finalRankings.filter(entry => entry.score === highestScore).map(entry => entry.username);
    const result = {
      gameType: "quiz",
      round: room.round,
      totalRounds,
      finalRound,
      question: quizQuestionForPublic(question),
      correctAnswer: question.answer,
      correctText: question.options[question.answer] || "",
      entries,
      roundWinners,
      scores,
      finalRankings,
      finalWinners,
      winner: finalRound ? (finalWinners[0] || null) : null,
      timedOut: Boolean(timedOut),
      createdAt: isoNow()
    };
    result.entryFee = finalRound ? settleGameEntryFees(room, finalWinners) : null;
    room.lastResult = result;
    room.round = finalRound ? totalRounds : integer(room.round, 1) + 1;
    room.quiz.current = null;
    room.quiz.answers = {};
    room.quiz.deadlineAt = null;
    room.quiz.nextRoundAt = finalRound ? null : Date.now() + QUIZ_RESULT_TIME_MS;
    room.quiz.finalRankings = finalRound ? finalRankings : [];
    room.quiz.finalWinners = finalRound ? finalWinners : [];
    room.status = finalRound ? "finished" : "results";
    room.updatedAt = isoNow();
    return result;
  }

  function initializeSnakesRoom(room) {
    if (!room || room.gameType !== "snakes_ladders" || room.players.length < 2) return false;
    room.snakes = {
      positions: Object.fromEntries(room.players.map(username => [username, 1])),
      currentTurn: 0,
      turnDeadlineAt: Date.now() + SNAKES_TURN_TIME_MS,
      lastRoll: null,
      lastMove: null,
      winner: null
    };
    room.lastResult = null;
    room.round = 1;
    room.status = "playing";
    room.updatedAt = isoNow();
    return true;
  }

  function applySnakesRoll(room, actor, { automatic = false } = {}) {
    if (!room || room.gameType !== "snakes_ladders" || room.status !== "playing" || !room.snakes) return null;
    const players = Array.isArray(room.players) ? room.players : [];
    if (!room.snakes.positions || typeof room.snakes.positions !== "object") {
      room.snakes.positions = Object.fromEntries(players.map(username => [username, 1]));
    }
    const turnIndex = Math.max(0, Math.min(players.length - 1, integer(room.snakes.currentTurn, 0)));
    const expected = players[turnIndex];
    if (!expected || actor !== expected) return null;
    const roll = crypto.randomInt(1, 7);
    const before = Math.max(1, integer(room.snakes.positions?.[actor], 1));
    const attempted = before + roll;
    const stepped = attempted <= SNAKES_BOARD_SIZE ? attempted : before;
    // Resolve the board rule only after the dice movement has landed.  The
    // keys are the visible ladder bottoms and snake heads; there are no
    // hidden coloured control squares involved in the rule itself.
    const jumpTo = resolveSnakesJump(stepped);
    const after = jumpTo == null ? stepped : jumpTo;
    const jumpType = jumpTo == null ? null : (jumpTo > stepped ? "ladder" : "snake");
    room.snakes.positions[actor] = after;
    const finished = after >= SNAKES_BOARD_SIZE;
    const extraTurn = !finished && roll === 6;
    const result = {
      gameType: "snakes_ladders",
      round: room.round,
      player: actor,
      roll,
      before,
      stepped,
      after,
      jumpTo,
      jumpType,
      landedOn: stepped,
      automatic: Boolean(automatic),
      extraTurn,
      winner: finished ? actor : null,
      createdAt: isoNow()
    };
    result.entryFee = finished ? settleGameEntryFees(room, [actor]) : null;
    room.snakes.lastRoll = roll;
    room.snakes.lastMove = result;
    room.round = integer(room.round, 1) + 1;
    if (finished) {
      room.snakes.winner = actor;
      room.snakes.turnDeadlineAt = null;
      room.status = "finished";
    } else {
      room.snakes.currentTurn = extraTurn ? turnIndex : ((turnIndex + 1) % players.length);
      room.snakes.turnDeadlineAt = Date.now() + SNAKES_TURN_TIME_MS;
      room.status = "playing";
    }
    room.lastResult = result;
    room.updatedAt = isoNow();
    return result;
  }

  function processAdvancedTimers() {
    const db = dbState();
    const now = Date.now();
    let changed = false;
    for (const room of Object.values(db.gameRooms || {})) {
      if (!isAdvancedRoom(room) || !Array.isArray(room.players) || room.players.length < 2) continue;
      if (room.gameType === "quiz") {
        if (room.status === "playing" && room.quiz?.current && Number(room.quiz?.deadlineAt || 0) <= now) {
          finishQuizRound(room, { timedOut: true });
          changed = true;
          emitGameState(room.roomId);
          io.to(`game_${room.roomId}`).emit("game:advanced-result", room.lastResult);
        } else if (room.status === "results" && Number(room.quiz?.nextRoundAt || 0) <= now) {
          startQuizRound(room);
          changed = true;
          emitGameState(room.roomId);
        }
      } else if (room.gameType === "snakes_ladders"
        && room.status === "playing"
        && room.snakes?.turnDeadlineAt
        && Number(room.snakes.turnDeadlineAt) <= now) {
        const actor = room.players[Math.max(0, Math.min(room.players.length - 1, integer(room.snakes?.currentTurn, 0)))];
        const result = applySnakesRoll(room, actor, { automatic: true });
        if (result) {
          changed = true;
          emitGameState(room.roomId);
          io.to(`game_${room.roomId}`).emit("game:advanced-result", result);
        }
      } else if (room.gameType === "dominoes"
        && room.status === "playing"
        && room.domino?.turnDeadlineAt
        && Number(room.domino.turnDeadlineAt) <= now) {
        const outcome = dominoAutomaticAction(room);
        if (outcome?.ok) {
          changed = true;
          emitGameState(room.roomId);
          io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        }
      } else if (room.gameType === "uno"
        && room.status === "playing"
        && room.uno?.turnDeadlineAt
        && Number(room.uno.turnDeadlineAt) <= now) {
        const outcome = unoAutomaticAction(room);
        if (outcome?.ok) {
          changed = true;
          emitGameState(room.roomId);
          io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        }
      } else if (room.gameType === "jackaroo"
        && room.status === "playing"
        && room.jackaroo?.turnDeadlineAt
        && Number(room.jackaroo.turnDeadlineAt) <= now) {
        const outcome = jackarooAutomaticAction(room);
        if (outcome?.ok) {
          changed = true;
          emitGameState(room.roomId);
          io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        }
      }
    }
    if (changed) persist();
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
      { itemId: "gift_heart", type: "gift", name: "هدية قلب", description: "هدية رقمية مميزة داخل محفظتك.", price: 25, charismaValue: 5, icon: "fa-heart", metadata: { giftKind: "heart", iconEmoji: "💖" }, active: true },
      { itemId: "gift_star", type: "gift", name: "هدية نجمة", description: "هدية رقمية لامعة.", price: 50, charismaValue: 10, icon: "fa-star", metadata: { giftKind: "star", iconEmoji: "🌟" }, active: true },
      { itemId: "gift_crown", type: "gift", name: "هدية تاج", description: "هدية خاصة للأصدقاء.", price: 100, charismaValue: 20, icon: "fa-crown", metadata: { giftKind: "crown", iconEmoji: "👑" }, active: true },
      { itemId: KING_GIFT_ITEM_ID, type: "gift", name: "ملك الهدايا", description: "هدية ملكية بمردود عشوائي وفرصة للفوز بصندوق الكوينز المتراكم.", price: 300, charismaValue: 60, icon: "fa-crown", metadata: { giftKind: "king", iconEmoji: "👑", luckyRange: 300 }, active: true },
      { itemId: KING_GIFT_LUCKY_REWARD_ID, type: "gift", name: "هدية الحظ الملكية", description: "مكافأة نادرة من ملك الهدايا.", price: 0, charismaValue: 150, icon: "fa-gem", metadata: { giftKind: "king-lucky-reward", iconEmoji: "💎", rewardOnly: true }, active: false }
    ];
    for (const item of defaultItems) {
      if (!db.shopItems[item.itemId]) {
        db.shopItems[item.itemId] = { ...item, sold: 0, createdAt: isoNow(), updatedAt: isoNow() };
        changed = true;
      }
    }
    for (const item of Object.values(db.shopItems)) {
      if (!item || item.type !== "gift" || !item.itemId) continue;
      if (!item.metadata || typeof item.metadata !== "object") {
        item.metadata = { giftKind: item.itemId.replace(/^gift_/, ""), iconEmoji: item.itemId === KING_GIFT_ITEM_ID ? "👑" : "🎁" };
        item.updatedAt = isoNow();
        changed = true;
      }
      if (item.itemId === KING_GIFT_ITEM_ID) {
        const before = `${item.kingMysteryRangeMin || 0}:${item.kingMysteryRangeMax || 0}:${item.kingSecretNumber || 0}`;
        ensureKingMysteryState(item);
        const after = `${item.kingMysteryRangeMin || 0}:${item.kingMysteryRangeMax || 0}:${item.kingSecretNumber || 0}`;
        if (before !== after) { item.updatedAt = isoNow(); changed = true; }
      }
      if (!db.giftStats[item.itemId] || typeof db.giftStats[item.itemId] !== "object") {
        const seedTotal = Math.max(0, integer(item.sold, 0) * Math.max(0, integer(item.price, 0)));
        db.giftStats[item.itemId] = {
          coinsSpent: seedTotal,
          purchases: Math.max(0, integer(item.sold, 0)),
          totalSpent: seedTotal,
          wins: 0,
          updatedAt: isoNow()
        };
        changed = true;
      } else {
        const stats = db.giftStats[item.itemId];
        const pool = Math.max(0, integer(stats.coinsSpent, 0));
        if (stats.totalSpent == null || integer(stats.totalSpent, 0) < pool) {
          stats.totalSpent = pool;
          changed = true;
        }
        if (stats.wins == null) {
          stats.wins = 0;
          changed = true;
        }
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

  // Deliver one or more already-purchased gift entries in one atomic request.
  // Each gift keeps its own refund/jackpot roll and charisma record, while the
  // caller can return a compact batch summary to the browser.
  function deliverGiftEntries({ db, senderKey, targetKey, entries }) {
    const sender = db.users?.[senderKey];
    const recipient = db.users?.[targetKey];
    if (!sender || !recipient) throw new Error("المستخدم المستلم غير موجود");
    const gifts = [];
    const rewards = [];
    let totalRefund = 0;
    let totalPrice = 0;
    let totalCharisma = 0;
    let totalJackpot = 0;

    for (const entry of entries) {
      const item = db.shopItems?.[entry.itemId] || null;
      const giftPrice = Math.max(0, integer(entry.price ?? item?.price, 0));
      const refundRoll = rollGiftReturn(giftPrice);
      const refundAmount = refundRoll.amount;
      totalPrice += giftPrice;
      totalRefund += refundAmount;
      const refundOwner = targetKey === senderKey ? sender : recipient;
      const refundOwnerKey = targetKey === senderKey ? senderKey : targetKey;
      if (refundAmount > 0) {
        refundOwner.coins = Math.min(MAX_COIN_BALANCE, integer(refundOwner.coins, 0) + refundAmount);
        createTransaction(refundOwner, {
          delta: refundAmount,
          type: "gift_lucky_refund",
          reason: `مردود عشوائي من ${entry.name || item?.name || "الهدية"}`,
          metadata: { itemId: entry.itemId, price: giftPrice, refundAmount, recipient: refundOwnerKey }
        });
      }

      const charismaValue = itemCharismaValue({ ...(item || {}), ...entry }, giftPrice);
      totalCharisma += charismaValue;
      const gift = {
        giftId: randomId("gift"),
        itemId: entry.itemId,
        name: entry.name || item?.name || "هدية",
        icon: entry.icon || item?.icon || "fa-gift",
        imageUrl: entry.imageUrl || item?.imageUrl || "",
        animated: Boolean(entry.animated ?? item?.animated),
        price: giftPrice,
        metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : (item?.metadata || {}),
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

      const reward = {
        kind: "refund",
        refundAmount,
        price: giftPrice,
        luckyNumber: null,
        lucky: false,
        secretMatched: false,
        jackpotAmount: 0,
        jackpotPool: 0,
        mysteryOpened: false,
        mysteryAmount: 0,
        mysteryRange: null,
        rewardItem: null,
        refundRecipient: refundOwnerKey,
        message: refundAmount > 0
          ? (targetKey === senderKey
            ? `رجعلك ${refundAmount.toLocaleString("en-US")} كوينز من الهدية.`
            : `وصل للمستلم ${targetKey} مردود ${refundAmount.toLocaleString("en-US")} كوينز.`)
          : (targetKey === senderKey ? "ماكو مردود لهذه الهدية." : `ماكو مردود للمستلم ${targetKey} لهذه الهدية.`)
      };
      if (entry.itemId === KING_GIFT_ITEM_ID || item?.metadata?.giftKind === "king") {
        // The owner's number never leaves the server. Only the match result is
        // returned, even when several King Gifts are sent in one batch.
        const mysteryRange = ensureKingMysteryState(item) || { min: 151, max: 300 };
        const secretNumber = Math.max(0, integer(item?.kingSecretNumber, 0));
        // A match is possible only for the 10% high-return band.
        const secretMatched = refundRoll.highBand
          && secretNumber >= mysteryRange.min
          && secretNumber <= mysteryRange.max
          && refundAmount === secretNumber;
        reward.mysteryRange = { ...mysteryRange };
        reward.secretMatched = secretMatched;
        reward.lucky = secretMatched;
        const stats = db.giftStats?.[KING_GIFT_ITEM_ID] && typeof db.giftStats[KING_GIFT_ITEM_ID] === "object"
          ? db.giftStats[KING_GIFT_ITEM_ID]
          : (db.giftStats[KING_GIFT_ITEM_ID] = { coinsSpent: 0, purchases: 0, totalSpent: 0, wins: 0 });
        const pool = Math.max(0, integer(stats.coinsSpent, 0));
        reward.jackpotPool = pool;
        if (secretMatched) {
          const available = Math.max(0, MAX_COIN_BALANCE - integer(sender.coins, 0));
          const jackpotAmount = Math.min(pool, available);
          if (jackpotAmount > 0) {
            sender.coins += jackpotAmount;
            createTransaction(sender, {
              delta: jackpotAmount,
              type: "gift_king_jackpot",
              reason: "جائزة ملك الهدايا",
              metadata: { itemId: KING_GIFT_ITEM_ID, jackpotAmount, poolBefore: pool, refundAmount }
            });
            stats.coinsSpent = Math.max(0, pool - jackpotAmount);
            if (stats.coinsSpent === 0) stats.purchases = 0;
            stats.wins = Math.max(0, integer(stats.wins, 0)) + 1;
            stats.lastWinner = senderKey;
            stats.lastWonAt = isoNow();
            stats.updatedAt = isoNow();
          }
          totalJackpot += jackpotAmount;
          reward.jackpotAmount = jackpotAmount;
          reward.message = jackpotAmount > 0
            ? `تطابق الرقم الغامض! ربحت ${jackpotAmount.toLocaleString("en-US")} كوينز من الصندوق المتراكم.`
            : "تطابق الرقم الغامض، لكن الصندوق المتراكم فارغ حاليًا.";
        } else {
          reward.message = refundAmount > 0
            ? (targetKey === senderKey
              ? `رجعلك ${refundAmount.toLocaleString("en-US")} كوينز، لكن الرقم الغامض لم يتطابق.`
              : `وصل للمستلم ${targetKey} مردود ${refundAmount.toLocaleString("en-US")} كوينز، لكن الرقم الغامض لم يتطابق.`)
            : (targetKey === senderKey
              ? "ماكو مردود لهذه الهدية، والرقم الغامض لم يتطابق."
              : `ماكو مردود للمستلم ${targetKey}، والرقم الغامض لم يتطابق.`);
        }
        // Rotate after every King Gift attempt, including each item in a bulk
        // send. The next shopper therefore sees a fresh public range.
        rotateKingMystery(item);
      }

      recipient.receivedGifts.unshift(gift);
      recipient.receivedGifts = recipient.receivedGifts.slice(0, 100);
      sender.sentGifts.unshift(gift);
      sender.sentGifts = sender.sentGifts.slice(0, 100);
      createTransaction(sender, {
        delta: 0,
        type: "gift_sent",
        reason: `إرسال ${gift.name} إلى ${targetKey}`,
        metadata: { giftId: gift.giftId, itemId: gift.itemId, toUsername: targetKey, charismaValue, refundAmount }
      });
      createTransaction(recipient, {
        delta: 0,
        type: "gift_received",
        reason: `استلام ${gift.name} من ${senderKey}`,
        metadata: { giftId: gift.giftId, itemId: gift.itemId, fromUsername: senderKey, charismaValue }
      });
      gifts.push(gift);
      rewards.push(reward);
    }
    return { gifts, rewards, totalRefund, totalPrice, totalCharisma, totalJackpot };
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
      const db = dbState();
      const items = ensureDefaultShopItems().filter(item => item.active !== false).map(item => publicShopItem(item, db));
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
      const quantity = Math.max(1, Math.min(100, integer(req.body?.quantity, 1)));
      const item = db.shopItems[itemId];
      const user = db.users[req.authUser];
      if (!item || item.active === false) return res.status(404).json({ error: "العنصر غير موجود أو غير متاح" });
      if (!user) return res.status(401).json({ error: "الحساب غير موجود" });
      ensureEconomyUser(user);
      if (item.stock != null && integer(item.sold) + quantity > integer(item.stock)) return res.status(400).json({ error: "الكمية المطلوبة غير متوفرة" });
      const price = Math.max(0, integer(item.price));
      const totalPrice = price * quantity;
      if (user.coins < totalPrice) return res.status(400).json({ error: "رصيدك من كوينز TOMI غير كافٍ" });
      if (item.type === "frame" && (!item.frameId || !db.frames?.[item.frameId])) return res.status(400).json({ error: "الإطار غير متوفر حاليًا" });

      user.coins -= totalPrice;
      createTransaction(user, { delta: -totalPrice, type: "purchase", reason: quantity > 1 ? `شراء ${item.name} ×${quantity}` : `شراء ${item.name}`, metadata: { itemId: item.itemId, price, quantity, totalPrice } });
      const purchasedEntries = Array.from({ length: quantity }, () => ({
        inventoryId: randomId("inv"),
        itemId: item.itemId,
        type: item.type,
        name: item.name,
        description: item.description || "",
        price,
        icon: item.icon || "fa-gift",
        imageUrl: item.imageUrl || "",
        frameId: item.frameId || null,
        frameUrl: item.frameUrl || "",
        animated: Boolean(item.animated),
        charismaValue: item.type === "gift" ? itemCharismaValue(item, price) : 0,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
        purchasedAt: isoNow()
      }));
      user.inventory.push(...purchasedEntries);
      item.sold = Math.max(0, integer(item.sold)) + quantity;
      if (item.type === "gift") {
        const stats = db.giftStats[item.itemId] && typeof db.giftStats[item.itemId] === "object"
          ? db.giftStats[item.itemId]
          : (db.giftStats[item.itemId] = { coinsSpent: 0, purchases: 0, totalSpent: 0, wins: 0 });
        stats.coinsSpent = Math.max(0, integer(stats.coinsSpent, 0)) + totalPrice;
        stats.purchases = Math.max(0, integer(stats.purchases, 0)) + quantity;
        stats.totalSpent = Math.max(0, integer(stats.totalSpent, 0)) + totalPrice;
        stats.updatedAt = isoNow();
      }
      item.updatedAt = isoNow();
      persist();
      emitWallet(req.authUser);
      const shopItem = publicShopItem(item, db);
      io.emit("economy-shop-updated", { item: shopItem });
      res.json({ success: true, message: quantity > 1 ? `تم شراء ${item.name} ×${quantity} وإضافتها إلى محفظتك` : "تم الشراء وإضافة العنصر إلى محفظتك", purchased: publicInventoryEntry(purchasedEntries[0], db.shopItems), purchasedCount: quantity, shopItem, wallet: walletPayload(req.authUser) });
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
      const itemId = clampText(req.body?.itemId, 120);
      const quantity = Math.max(1, Math.min(100, integer(req.body?.quantity, 1)));
      const sender = db.users?.[senderKey];
      const recipient = targetKey ? db.users?.[targetKey] : null;
      if (!sender || !recipient) return res.status(404).json({ error: "المستخدم المستلم غير موجود" });
      ensureEconomyUser(sender);
      ensureEconomyUser(recipient);

      const selectedIndexes = [];
      if (inventoryId) {
        const firstIndex = sender.inventory.findIndex(entry => entry?.inventoryId === inventoryId);
        if (firstIndex < 0) return res.status(404).json({ error: "الهدية غير موجودة في محفظتك" });
        const selectedItemId = sender.inventory[firstIndex]?.itemId;
        for (let index = 0; index < sender.inventory.length && selectedIndexes.length < quantity; index += 1) {
          const entry = sender.inventory[index];
          if (entry?.itemId === selectedItemId && (entry.type || db.shopItems?.[entry.itemId]?.type) === "gift") selectedIndexes.push(index);
        }
      } else if (itemId) {
        for (let index = 0; index < sender.inventory.length && selectedIndexes.length < quantity; index += 1) {
          const entry = sender.inventory[index];
          if (entry?.itemId === itemId && (entry.type || db.shopItems?.[entry.itemId]?.type) === "gift") selectedIndexes.push(index);
        }
      }
      if (!selectedIndexes.length) return res.status(404).json({ error: "لا توجد هدايا من هذا النوع في محفظتك" });
      if (selectedIndexes.length < quantity) return res.status(400).json({ error: `المتاح من هذه الهدية ${selectedIndexes.length} فقط` });
      const entries = selectedIndexes.map(index => sender.inventory[index]);
      if (entries.some(entry => (entry.type || db.shopItems?.[entry.itemId]?.type) !== "gift")) return res.status(400).json({ error: "هذا العنصر ليس هدية قابلة للإرسال" });
      selectedIndexes.sort((a, b) => b - a).forEach(index => sender.inventory.splice(index, 1));
      const result = deliverGiftEntries({ db, senderKey, targetKey, entries });
      const rewards = result.rewards;
      const reward = rewards.length === 1 ? rewards[0] : {
        kind: "batch",
        refundAmount: result.totalRefund,
        price: result.totalPrice,
        luckyNumber: null,
        lucky: rewards.some(row => row.lucky),
        secretMatched: rewards.some(row => row.secretMatched),
        jackpotAmount: result.totalJackpot,
        jackpotPool: rewards[rewards.length - 1]?.jackpotPool || 0,
        mysteryOpened: false,
        mysteryAmount: 0,
        mysteryRange: rewards[rewards.length - 1]?.mysteryRange || null,
        rewardItem: null,
        message: `تم إرسال ${result.gifts.length} هدايا. مجموع المردود: ${result.totalRefund.toLocaleString("en-US")} كوينز.`
      };
      persist();
      emitWallet(senderKey);
      if (targetKey !== senderKey) emitWallet(targetKey);
      if (entries.some(entry => entry.itemId === KING_GIFT_ITEM_ID || db.shopItems?.[entry.itemId]?.metadata?.giftKind === "king")) {
        io.emit("economy-shop-updated", { item: publicShopItem(db.shopItems?.[KING_GIFT_ITEM_ID], db) });
      }
      const recipientProfile = publicUserProfile(targetKey);
      io.emit("profile-updated", recipientProfile);
      result.gifts.forEach(gift => io.to(`user_${targetKey}`).emit("gift-received", { gift: publicGiftTransfer(gift), profile: recipientProfile }));
      res.json({
        success: true,
        message: `${targetKey === senderKey ? "تم إرسال الهدية إلى نفسك ورفع كارزمتك" : `تم إرسال الهدية إلى ${targetKey}`}. ${reward.message}`,
        gift: result.gifts.length === 1 ? publicGiftTransfer(result.gifts[0]) : null,
        gifts: result.gifts.map(publicGiftTransfer),
        quantity: result.gifts.length,
        reward,
        rewards,
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
    const db = dbState();
    res.json({ success: true, items: ensureDefaultShopItems().map(item => publicShopItem(item, db, { includeAdmin: true })) });
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
    res.json({ success: true, item: publicShopItem(item, db, { includeAdmin: true }) });
  });

  app.patch("/api/economy/admin/items/:itemId", requireHttpAuth, (req, res) => {
    if (!onlyOwner(req, res)) return;
    const db = dbState();
    ensureDefaultShopItems();
    const item = db.shopItems[req.params.itemId];
    if (!item) return res.status(404).json({ error: "العنصر غير موجود" });
    const nextPrice = req.body.price === undefined
      ? Math.max(0, integer(item.price, 0))
      : Math.max(0, Math.min(10_000_000, integer(req.body.price, item.price)));
    if (item.itemId === KING_GIFT_ITEM_ID && nextPrice < 1) return res.status(400).json({ error: "سعر ملك الهدايا يجب أن يكون أكبر من صفر" });
    let nextSecret = Math.max(0, integer(item.kingSecretNumber, 0));
    if (item.itemId === KING_GIFT_ITEM_ID && req.body.kingSecretNumber !== undefined) {
      const requestedSecret = integer(req.body.kingSecretNumber, 0);
      if (requestedSecret < 1 || requestedSecret > Math.max(1, nextPrice)) {
        return res.status(400).json({ error: "الرقم الغامض يجب أن يكون بين 1 وسعر الهدية" });
      }
      nextSecret = requestedSecret;
    }
    if (item.itemId === KING_GIFT_ITEM_ID && nextSecret > Math.max(1, nextPrice)) {
      return res.status(400).json({ error: "السعر الجديد أصغر من الرقم الغامض الحالي؛ غيّر الرقم الغامض أولًا" });
    }
    if (req.body.name !== undefined) item.name = clampText(req.body.name, 80) || item.name;
    if (req.body.description !== undefined) item.description = clampText(req.body.description, 240);
    if (req.body.icon !== undefined) item.icon = clampText(req.body.icon || "fa-gift", 50) || "fa-gift";
    if (req.body.imageUrl !== undefined) item.imageUrl = clampText(req.body.imageUrl, 500);
    if (req.body.animated !== undefined) item.animated = Boolean(req.body.animated);
    item.price = nextPrice;
    if (item.itemId === KING_GIFT_ITEM_ID) {
      item.kingSecretNumber = nextSecret;
      const eligibleMin = giftMysteryEligibleMin(nextPrice);
      const rangeMin = Math.max(eligibleMin, nextSecret - 20);
      const rangeMax = Math.min(Math.max(1, Math.min(300, nextPrice)), nextSecret + 20);
      item.kingMysteryRangeMin = Math.min(rangeMin, rangeMax);
      item.kingMysteryRangeMax = Math.max(item.kingMysteryRangeMin, rangeMax);
    }
    if (req.body.charismaValue !== undefined && item.type === "gift") item.charismaValue = Math.max(1, Math.min(1_000_000, integer(req.body.charismaValue, item.charismaValue || 1)));
    if (req.body.active !== undefined) item.active = Boolean(req.body.active);
    if (req.body.stock !== undefined) item.stock = req.body.stock === null || req.body.stock === "" ? null : Math.max(0, integer(req.body.stock));
    item.updatedAt = isoNow();
    persist();
    res.json({ success: true, item: publicShopItem(item, db, { includeAdmin: true }) });
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

  function publicDominoState(room) {
    const state = room?.domino;
    const currentTurn = Math.max(0, integer(state?.currentTurn, 0));
    const handCounts = Object.fromEntries((room?.players || []).map(username => [
      username,
      Array.isArray(state?.hands?.[username]) ? state.hands[username].length : 0
    ]));
    return {
      board: Array.isArray(state?.board) ? state.board.map(dominoTilePublic).filter(Boolean) : [],
      leftEnd: state?.leftEnd ?? null,
      rightEnd: state?.rightEnd ?? null,
      currentTurn,
      currentPlayer: room?.players?.[currentTurn] || null,
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null,
      handCounts,
      boneyardCount: Array.isArray(state?.boneyard) ? state.boneyard.length : 0,
      lastMove: state?.lastMove || null,
      winner: state?.winner || null,
      winners: Array.isArray(state?.winners) ? state.winners : [],
      scores: Object.fromEntries((room?.players || []).map(username => [username, Math.max(0, integer(state?.scores?.[username], 0))]))
    };
  }

  function privateDominoState(room, username) {
    const state = room?.domino;
    const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
    const moves = dominoLegalMoves(room, username);
    const isTurn = room?.status === "playing" && room?.players?.[integer(state?.currentTurn, 0)] === username;
    return {
      roomId: room?.roomId,
      gameType: "dominoes",
      hand: hand.map(dominoTilePublic).filter(Boolean),
      legalTileIds: [...new Set(moves.map(move => move.tile.id))],
      legalMoves: moves.map(move => ({ tileId: move.tile.id, side: move.side })),
      isTurn,
      canDraw: Boolean(isTurn && !moves.length && state?.boneyard?.length),
      canPass: Boolean(isTurn && !moves.length && !state?.boneyard?.length),
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null
    };
  }

  function emitDominoPrivateState(roomId) {
    const db = dbState();
    const room = db.gameRooms?.[roomId];
    if (!room || room.gameType !== "dominoes" || !io?.sockets?.sockets?.forEach) return;
    io.sockets.sockets.forEach(socket => {
      if (!socket.rooms?.has(`game_${roomId}`)) return;
      const actor = gameActor(socket);
      if (actor && room.players.includes(actor)) socket.emit("game:domino-private", privateDominoState(room, actor));
    });
  }

  function publicUnoState(room) {
    const state = room?.uno;
    const currentTurn = Math.max(0, integer(state?.currentTurn, 0));
    const top = state?.discard?.[state.discard.length - 1] || null;
    return {
      topCard: unoCardPublic(top),
      currentColor: UNO_COLORS.includes(state?.currentColor) ? state.currentColor : null,
      currentColorLabel: UNO_COLOR_LABELS[state?.currentColor] || "",
      direction: state?.direction === -1 ? "counterclockwise" : "clockwise",
      currentTurn,
      currentPlayer: room?.players?.[currentTurn] || null,
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null,
      handCounts: Object.fromEntries((room?.players || []).map(username => [
        username,
        Array.isArray(state?.hands?.[username]) ? state.hands[username].length : 0
      ])),
      deckCount: Array.isArray(state?.deck) ? state.deck.length : 0,
      discardCount: Array.isArray(state?.discard) ? state.discard.length : 0,
      pendingDraw: Math.max(0, integer(state?.pendingDraw, 0)),
      lastMove: state?.lastMove || null,
      winner: state?.winner || null,
      scores: Object.fromEntries((room?.players || []).map(username => [username, Math.max(0, integer(state?.scores?.[username], 0))]))
    };
  }

  function privateUnoState(room, username) {
    const state = room?.uno;
    const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
    const legal = unoLegalCards(room, username);
    const isTurn = room?.status === "playing" && room?.players?.[integer(state?.currentTurn, 0)] === username;
    return {
      roomId: room?.roomId,
      gameType: "uno",
      hand: hand.map(unoCardPublic).filter(Boolean),
      legalCardIds: legal.map(card => card.id),
      isTurn,
      pendingDraw: Math.max(0, integer(state?.pendingDraw, 0)),
      canDraw: Boolean(isTurn && (state?.pendingDraw > 0 || !legal.length)),
      canCallUno: Boolean(room?.status === "playing" && hand.length === 1 && state?.lastMove?.type === "play" && state.lastMove.player === username && !state?.unoCalled?.[username]),
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null,
      colors: UNO_COLORS.map(color => ({ id: color, label: UNO_COLOR_LABELS[color], hex: UNO_COLOR_HEX[color] }))
    };
  }

  function emitUnoPrivateState(roomId) {
    const db = dbState();
    const room = db.gameRooms?.[roomId];
    if (!room || room.gameType !== "uno" || !io?.sockets?.sockets?.forEach) return;
    io.sockets.sockets.forEach(socket => {
      if (!socket.rooms?.has(`game_${roomId}`)) return;
      const actor = gameActor(socket);
      if (actor && room.players.includes(actor)) socket.emit("game:uno-private", privateUnoState(room, actor));
    });
  }

  function publicJackarooState(room) {
    const state = room?.jackaroo;
    const currentTurn = Math.max(0, integer(state?.currentTurn, 0));
    const tokens = [];
    for (const username of room?.players || []) {
      const team = jackarooTeamFor(room, username);
      const playerIndex = (room?.players || []).indexOf(username);
      for (const marble of state?.marbles?.[username] || []) {
        const progress = integer(marble.progress, -1);
        const cell = jackarooCellFor(room, username, progress);
        tokens.push({
          username,
          playerIndex,
          marbleId: marble.id,
          team,
          progress,
          cell,
          status: progress < 0 ? "base" : progress >= JACKAROO_HOME_PROGRESS ? "home" : "board"
        });
      }
    }
    const cellTokens = Object.fromEntries(Array.from({ length: JACKAROO_BOARD_SIZE }, (_, cell) => [cell, tokens.filter(token => token.cell === cell)]));
    return {
      boardSize: JACKAROO_BOARD_SIZE,
      tokens,
      cellTokens,
      currentTurn,
      currentPlayer: room?.players?.[currentTurn] || null,
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null,
      handCounts: Object.fromEntries((room?.players || []).map(username => [username, Array.isArray(state?.hands?.[username]) ? state.hands[username].length : 0])),
      deckCount: Array.isArray(state?.deck) ? state.deck.length : 0,
      discardCount: Array.isArray(state?.discard) ? state.discard.length : 0,
      discardTop: jackarooCardPublic(state?.discard?.[state.discard.length - 1]),
      teams: state?.teams || { team1: [], team2: [] },
      scores: { team1: Math.max(0, integer(state?.scores?.team1, 0)), team2: Math.max(0, integer(state?.scores?.team2, 0)) },
      winnerTeam: state?.winnerTeam || null,
      winnerPlayers: Array.isArray(state?.winnerPlayers) ? state.winnerPlayers : [],
      lastMove: state?.lastMove || null
    };
  }

  function privateJackarooState(room, username) {
    const state = room?.jackaroo;
    const hand = Array.isArray(state?.hands?.[username]) ? state.hands[username] : [];
    const legal = jackarooLegalMoves(room, username);
    const isTurn = room?.status === "playing" && room?.players?.[integer(state?.currentTurn, 0)] === username;
    return {
      roomId: room?.roomId,
      gameType: "jackaroo",
      hand: hand.map(jackarooCardPublic).filter(Boolean),
      legalMoves: legal.map(move => ({ cardId: move.card.id, marbleId: move.marbleId, mode: move.mode, steps: move.steps, from: move.from, to: move.to })),
      legalCardIds: [...new Set(legal.map(move => move.card.id))],
      isTurn,
      canPass: Boolean(isTurn && !legal.length && hand.length),
      turnDeadlineAt: Number(state?.turnDeadlineAt || 0) || null,
      team: jackarooTeamFor(room, username),
      teams: state?.teams || { team1: [], team2: [] }
    };
  }

  function emitJackarooPrivateState(roomId) {
    const db = dbState();
    const room = db.gameRooms?.[roomId];
    if (!room || room.gameType !== "jackaroo" || !io?.sockets?.sockets?.forEach) return;
    io.sockets.sockets.forEach(socket => {
      if (!socket.rooms?.has(`game_${roomId}`)) return;
      const actor = gameActor(socket);
      if (actor && room.players.includes(actor)) socket.emit("game:jackaroo-private", privateJackarooState(room, actor));
    });
  }

  function publicGameRoom(room, db) {
    if (!room) return null;
    const spec = GAME_SPECS[room.gameType] || GAME_SPECS.number_battle;
    const advanced = spec.advanced || null;
    const quiz = advanced === "quiz" ? {
      question: quizQuestionForPublic(room.quiz?.current),
      category: room.quiz?.current?.category || "",
      deadlineAt: Number(room.quiz?.deadlineAt || 0) || null,
      answeredPlayers: Object.keys(room.quiz?.answers || {}),
      scores: quizScoreMap(room),
      totalRounds: normalizeQuizRounds(room.quizRounds || room.quiz?.totalRounds),
      finalRankings: Array.isArray(room.quiz?.finalRankings) ? room.quiz.finalRankings : [],
      finalWinners: Array.isArray(room.quiz?.finalWinners) ? room.quiz.finalWinners : [],
      lastResult: room.lastResult?.gameType === "quiz" ? room.lastResult : null
    } : null;
    const snakes = advanced === "snakes_ladders" ? {
      positions: snakesPositions(room),
      currentTurn: Math.max(0, integer(room.snakes?.currentTurn, 0)),
      currentPlayer: room.players?.[Math.max(0, integer(room.snakes?.currentTurn, 0))] || null,
      turnDeadlineAt: Number(room.snakes?.turnDeadlineAt || 0) || null,
      lastRoll: room.snakes?.lastRoll || null,
      lastMove: room.snakes?.lastMove || null,
      winner: room.snakes?.winner || null,
      ladders: SNAKES_LADDERS
    } : null;
    const domino = advanced === "dominoes" ? publicDominoState(room) : null;
    const uno = advanced === "uno" ? publicUnoState(room) : null;
    const jackaroo = advanced === "jackaroo" ? publicJackarooState(room) : null;
    return {
      roomId: room.roomId,
      name: room.name,
      gameType: room.gameType,
      gameName: spec.name,
      gameIcon: spec.icon,
      action: spec.action,
      actionLabel: spec.actionLabel,
      advanced,
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
        ready: advanced === "quiz"
          ? Object.prototype.hasOwnProperty.call(room.quiz?.answers || {}, username)
          : advanced === "snakes_ladders"
            ? username === room.players?.[Math.max(0, integer(room.snakes?.currentTurn, 0))]
            : advanced === "dominoes"
              ? username === room.players?.[Math.max(0, integer(room.domino?.currentTurn, 0))]
              : advanced === "uno"
                ? username === room.players?.[Math.max(0, integer(room.uno?.currentTurn, 0))]
                : advanced === "jackaroo"
                  ? username === room.players?.[Math.max(0, integer(room.jackaroo?.currentTurn, 0))]
                : Boolean(room.actions?.[username])
      })),
      lastResult: room.lastResult || null,
      entryFee: normalizeGameEntryFee(room.entryFee),
      fee: room.fee && typeof room.fee === "object" ? {
        collected: Boolean(room.fee.collected),
        settled: Boolean(room.fee.settled),
        entryFee: normalizeGameEntryFee(room.fee.entryFee || room.entryFee),
        totalPot: Math.max(0, integer(room.fee.totalPot, 0)),
        commission: Math.max(0, integer(room.fee.commission, 0)),
        prizePool: Math.max(0, integer(room.fee.prizePool, 0)),
        winners: Array.isArray(room.fee.winners) ? room.fee.winners.slice() : [],
        payouts: Array.isArray(room.fee.payouts) ? room.fee.payouts.slice() : [],
        collectedAt: room.fee.collectedAt || null,
        settledAt: room.fee.settledAt || null
      } : null,
      quiz,
      snakes,
      domino,
      uno,
      jackaroo,
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
    if (room?.gameType === "dominoes") emitDominoPrivateState(roomId);
    if (room?.gameType === "uno") emitUnoPrivateState(roomId);
    if (room?.gameType === "jackaroo") emitJackarooPrivateState(roomId);
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
    result.entryFee = settleGameEntryFees(room, winners);
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

    socket.on("game:start", ({ roomId } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const spec = roomSpec(room);
      if (!actor || !room || !spec?.advanced || room.owner !== actor) {
        return gameError(socket, "مالك الغرفة فقط يستطيع بدء هذه اللعبة");
      }
      if (room.players.length < 2) return gameError(socket, "تحتاج اللعبة إلى لاعبين على الأقل");
      if (spec.advanced === "dominoes" && !spec.allowedPlayers.includes(room.players.length)) {
        return gameError(socket, "الدومنة تبدأ بلاعبين أو أربعة لاعبين فقط");
      }
      if (spec.advanced === "jackaroo" && ![2, 4].includes(room.players.length)) {
        return gameError(socket, "توميرو تبدأ بلاعبين أو أربعة لاعبين فقط");
      }
      if (room.status === "playing" || room.status === "results") return gameError(socket, "اللعبة بدأت بالفعل");
      const started = spec.advanced === "quiz"
        ? startQuizRound(room, { resetScores: room.status === "finished" })
        : spec.advanced === "snakes_ladders"
          ? initializeSnakesRoom(room)
          : spec.advanced === "dominoes"
            ? startDominoRound(room)
            : spec.advanced === "uno"
              ? startUnoRound(room)
              : startJackarooRound(room);
      if (!started) return gameError(socket, "تعذر بدء اللعبة حالياً");
      const feeResult = collectGameEntryFees(room);
      if (!feeResult.ok) {
        resetAdvancedRoom(room);
        persist();
        return gameError(socket, feeResult.error);
      }
      persist();
      emitGameState(room.roomId);
    });

    socket.on("game:create-room", ({ gameType, maxPlayers, name, quizRounds, entryFee } = {}) => {
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
        entryFee: normalizeGameEntryFee(entryFee),
        fee: null,
        quizRounds: spec.id === "quiz" ? normalizeQuizRounds(quizRounds) : null,
        players: [actor],
        actions: {},
        round: 1,
        status: "waiting",
        quiz: null,
        snakes: null,
        domino: null,
        uno: null,
        jackaroo: null,
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
      if (!room.players.includes(actor) && isAdvancedRoom(room) && room.status !== "waiting" && room.status !== "ready") {
        return gameError(socket, "اللعبة بدأت؛ لا يمكن الانضمام الآن");
      }
      if (!room.players.includes(actor)) room.players.push(actor);
      if (!isAdvancedRoom(room)) room.status = room.players.length >= 2 ? "ready" : "waiting";
      else if (room.status === "waiting" && room.players.length >= 2) room.status = "ready";
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
      else if (isAdvancedRoom(room)) resetAdvancedRoom(room);
      else { room.status = room.players.length >= 2 ? "ready" : "waiting"; room.updatedAt = isoNow(); }
      persist();
      socket.emit("game:left", { roomId: room.roomId });
      if (db.gameRooms[room.roomId]) emitGameState(room.roomId); else emitGameRooms();
    });

    socket.on("game:action", ({ roomId, value, choice, action, answer, tileId, side, cardId, chosenColor, marbleId } = {}) => {
      const actor = gameActor(socket);
      const db = dbState();
      const room = db.gameRooms?.[clampText(roomId, 140)];
      const spec = roomSpec(room);
      if (!actor || !room || !spec || !room.players.includes(actor)) return gameError(socket, "لا تملك صلاحية اللعب في هذه الغرفة");
      if (room.players.length < 2) return gameError(socket, "انتظر انضمام لاعب آخر");
      if ((room.status === "playing" || room.status === "ready") && (!room.fee?.collected || room.fee?.settled)) {
        const feeResult = collectGameEntryFees(room);
        if (!feeResult.ok) return gameError(socket, feeResult.error);
      }

      if (spec.advanced === "quiz") {
        if (room.status !== "playing" || !room.quiz?.current) return gameError(socket, "لا توجد جولة أسئلة مفتوحة حالياً");
        if (Date.now() >= Number(room.quiz.deadlineAt || 0)) {
          const result = finishQuizRound(room, { timedOut: true });
          persist();
          emitGameState(room.roomId);
          if (result) io.to(`game_${room.roomId}`).emit("game:advanced-result", result);
          return gameError(socket, "انتهى وقت السؤال");
        }
        if (Object.prototype.hasOwnProperty.call(room.quiz.answers || {}, actor)) return gameError(socket, "سجلت إجابتك لهذه الجولة بالفعل");
        const cleanAnswer = integer(answer ?? value, -1);
        if (!Number.isInteger(cleanAnswer) || cleanAnswer < 0 || cleanAnswer >= room.quiz.current.options.length) {
          return gameError(socket, "اختيار الإجابة غير صالح");
        }
        room.quiz.answers[actor] = cleanAnswer;
        socket.emit("game:action-result", { roomId: room.roomId, gameType: room.gameType, value: cleanAnswer, round: room.round });
        const allAnswered = room.players.every(username => Object.prototype.hasOwnProperty.call(room.quiz.answers, username));
        const result = allAnswered ? finishQuizRound(room) : null;
        room.updatedAt = isoNow();
        persist();
        emitGameState(room.roomId);
        if (result) io.to(`game_${room.roomId}`).emit("game:advanced-result", result);
        return;
      }

      if (spec.advanced === "uno") {
        const cleanAction = action === "play" || action === "draw" || action === "uno" ? action : "";
        const outcome = applyUnoAction(room, actor, {
          action: cleanAction,
          cardId: clampText(cardId, 80),
          chosenColor: UNO_COLORS.includes(chosenColor) ? chosenColor : "",
          automatic: false
        });
        if (!outcome.ok) return gameError(socket, outcome.error);
        socket.emit("game:action-result", {
          roomId: room.roomId,
          gameType: room.gameType,
          value: outcome.result?.type || cleanAction,
          round: room.round
        });
        persist();
        emitGameState(room.roomId);
        io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        return;
      }

      if (spec.advanced === "dominoes") {
        const cleanAction = action === "play" || action === "draw" || action === "pass" ? action : "";
        const outcome = applyDominoAction(room, actor, {
          action: cleanAction,
          tileId: clampText(tileId, 20),
          side: side === "left" || side === "right" ? side : "",
          automatic: false
        });
        if (!outcome.ok) return gameError(socket, outcome.error);
        socket.emit("game:action-result", {
          roomId: room.roomId,
          gameType: room.gameType,
          value: outcome.result?.type || cleanAction,
          round: room.round
        });
        persist();
        emitGameState(room.roomId);
        io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        return;
      }

      if (spec.advanced === "jackaroo") {
        const cleanAction = action === "play" || action === "pass" ? action : "";
        const outcome = applyJackarooAction(room, actor, {
          action: cleanAction,
          cardId: clampText(cardId, 80),
          marbleId: clampText(marbleId, 30),
          automatic: false
        });
        if (!outcome.ok) return gameError(socket, outcome.error);
        socket.emit("game:action-result", {
          roomId: room.roomId,
          gameType: room.gameType,
          value: outcome.result?.type || cleanAction,
          round: room.round
        });
        persist();
        emitGameState(room.roomId);
        io.to(`game_${room.roomId}`).emit("game:advanced-result", outcome.result);
        return;
      }

      if (spec.advanced === "snakes_ladders") {
        if (room.status !== "playing" || !room.snakes) return gameError(socket, "ابدأ اللعبة أولاً");
        const expected = room.players[Math.max(0, Math.min(room.players.length - 1, integer(room.snakes.currentTurn, 0)))];
        if (actor !== expected) return gameError(socket, "انتظر دورك");
        if (action && action !== "roll") return gameError(socket, "الحركة غير صالحة");
        const result = applySnakesRoll(room, actor);
        if (!result) return gameError(socket, "تعذر تنفيذ رمية النرد");
        socket.emit("game:action-result", { roomId: room.roomId, gameType: room.gameType, value: result.roll, round: result.round });
        persist();
        emitGameState(room.roomId);
        io.to(`game_${room.roomId}`).emit("game:advanced-result", result);
        return;
      }

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
      if (isAdvancedRoom(room)) resetAdvancedRoom(room);
      else {
        room.updatedAt = isoNow();
        room.status = room.players.length >= 2 ? "ready" : "waiting";
      }
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
  advancedGamesTimer = setInterval(processAdvancedTimers, 1_000);
  advancedGamesTimer.unref?.();
  return {
    registerGameSocketHandlers,
    claimDailyForUser,
    chargeCoinsForVideo,
    refundCoins
  };
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
  ROULETTE_DAILY_PRIZES,
  GAME_ENTRY_FEES,
  GAME_PLATFORM_COMMISSION
};
