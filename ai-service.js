"use strict";

const crypto = require("node:crypto");

// TOMI's AI layer is deliberately provider-optional. The local rules and FAQ
// keep the feature useful on a small Render instance; a remote model is only
// contacted when the operator explicitly enables it in Render Environment.
const FAQ_ENTRIES = Object.freeze([
  {
    id: "create-room",
    title: "إنشاء غرفة عامة",
    keywords: ["غرفة", "انشاء", "إنشاء", "عامة", "روم", "room"],
    answer: "من نافذة المحادثات اكتب اسم الغرفة، اختر السعة، ثم اضغط «إنشاء غرفة عامة». سيظهر لك رمز المشاركة حتى ترسله لأصدقائك."
  },
  {
    id: "invite-friend",
    title: "دعوة صديق",
    keywords: ["دعوة", "دعوه", "صديق", "اصدقاء", "أصدقاء", "invite"],
    answer: "افتح الغرفة الصوتية واضغط «دعوة»، ثم اختر الصديق من القائمة. تصل إليه الدعوة مع زر «انضمام»."
  },
  {
    id: "notifications",
    title: "الإشعارات",
    keywords: ["اشعار", "إشعار", "اشعارات", "إشعارات", "تنبيه", "جرس", "notification"],
    answer: "تقدر تفعّل أو توقف إشعارات TOMI من زر الجرس داخل المحادثة أو من صفحة الإعدادات. السماح من المتصفح مطلوب حتى توصل الإشعارات خارج الصفحة."
  },
  {
    id: "upload",
    title: "رفع الفيديو والملفات",
    keywords: ["فيديو", "فديو", "ملف", "رفع", "تحميل", "upload", "video"],
    answer: "اختَر «الصور والفيديو» أو «الملفات» من زر +. الرفع يتم على دفعات قابلة للاستكمال، لذلك لا تغلق الصفحة أثناء ظهور حالة الرفع."
  },
  {
    id: "voice-room",
    title: "الغرف الصوتية",
    keywords: ["صوتية", "صوتيه", "مايك", "ميكروفون", "سماعة", "voice"],
    answer: "من القائمة افتح «الغرف الصوتية»، اختر غرفة ثم اسمح للمتصفح باستخدام المايكروفون. داخل الغرفة تقدر تدخل المقعد، تكتم المايك، أو تتحكم بالإعدادات حسب صلاحيتك."
  },
  {
    id: "private-chat",
    title: "المحادثة الخاصة",
    keywords: ["خاصة", "خاصه", "صديق", "مراسلة", "محادثة", "خصوصية", "private"],
    answer: "ابحث عن المستخدم وأرسل طلب مراسلة. بعد قبول الطلب تظهر محادثة خاصة بين الطرفين فقط، ولا يستطيع المستخدمون الآخرون دخولها."
  },
  {
    id: "report",
    title: "الإبلاغ عن إساءة",
    keywords: ["بلاغ", "ابلاغ", "إبلاغ", "اساءة", "إساءة", "مشكلة", "report"],
    answer: "من خيارات الرسالة أو ملف المستخدم اختر «إبلاغ»، اكتب السبب والتفاصيل وأرسل البلاغ. يراجعه المشرفون حسب الصلاحيات."
  },
  {
    id: "explore",
    title: "اكسبلور والمنشورات",
    keywords: ["اكسبلور", "استكشاف", "منشور", "انشر", "نشر", "فيديو", "ملاحظة"],
    answer: "من «اكسبلور» تقدر ترسل فيديو قصيراً أو ملاحظة كتابية قصيرة. يبقى المنشور قيد المراجعة ولا يظهر للكل إلا بعد موافقة المالك أو مشرف لديه صلاحية اكسبلور."
  },
  {
    id: "getting-started",
    title: "مساعدة المستخدم الجديد",
    keywords: ["جديد", "جديده", "بداية", "ابدأ", "استخدم الموقع", "اول مرة", "أول مرة"],
    answer: "أهلاً بك في TOMI. ابدأ بإكمال ملفك من الإعدادات، ابحث عن أصدقائك، ثم افتح المحادثات أو الغرف الصوتية. من «الألعاب» تنشئ غرفة لعب، ومن «المحفظة والمتجر» تشوف رصيدك وهداياك، ومن «اكسبلور» تتابع المنشورات بعد مراجعتها."
  },
  {
    id: "coins-games",
    title: "الكوينز والألعاب",
    keywords: ["كوين", "كوينز", "عملات", "رصيد", "روليت", "لعبة", "العاب", "ألعاب"],
    answer: "رصيد TOMI وإدارة الهدايا موجودان في «المحفظة والمتجر». تقدر تلعب ألعاب الموقع من «الألعاب»؛ راجع قيمة الرهان وقواعد الجولة قبل التأكيد."
  },
  {
    id: "search",
    title: "البحث داخل محادثاتي",
    keywords: ["بحث", "ابحث", "رسالة", "رسائل", "سجل", "search"],
    answer: "افتح مساعد TOMI واختَر «بحث محادثاتي». النتائج تظهر من المحادثات التي تملك صلاحية الوصول إليها فقط، ولا يتم البحث في محادثات الآخرين."
  },
  {
    id: "account",
    title: "الحساب وكلمة المرور",
    keywords: ["حساب", "كلمة", "كلمه", "مرور", "تسجيل", "دخول", "password"],
    answer: "من صفحة الإعدادات تقدر تعدّل الاسم والصورة وكلمة المرور. لا تشارك كلمة المرور أو رموز الدعوة مع أي شخص."
  }
]);

const HELP_CARDS = Object.freeze([
  { id: "rooms", icon: "fa-comments", title: "الغرف", text: "إنشاء غرفة عامة أو الدخول برمز مشاركة." },
  { id: "invites", icon: "fa-user-plus", title: "الدعوات", text: "دعوة الأصدقاء إلى المحادثة أو الغرفة الصوتية." },
  { id: "notifications", icon: "fa-bell", title: "الإشعارات", text: "تشغيل الإشعارات أو إيقافها من جهازك." },
  { id: "media", icon: "fa-photo-film", title: "الملفات", text: "إرسال الصور والفيديو والملفات بأمان." },
  { id: "explore", icon: "fa-compass", title: "اكسبلور", text: "تابع المنشورات العامة أو أرسل فيديو أو ملاحظة للمراجعة." },
  { id: "new-user", icon: "fa-hand-sparkles", title: "ابدأ هنا", text: "دليل سريع للمستخدم الجديد داخل TOMI." },
  { id: "privacy", icon: "fa-shield-halved", title: "الخصوصية", text: "المحادثات الخاصة لا تظهر إلا لأصحابها." }
]);

const STOP_WORDS = new Set([
  "من", "في", "على", "الى", "إلى", "عن", "هذا", "هذه", "هل", "ما", "هو", "هي", "انا", "أنا",
  "اريد", "أريد", "شلون", "كيف", "وين", "شنو", "the", "and", "for", "with", "how", "what"
]);

const SEARCH_SYNONYMS = Object.freeze({
  فيديو: ["فديو", "video", "مقطع"],
  فديو: ["فيديو", "video", "مقطع"],
  غرفة: ["روم", "room", "غرف"],
  صوت: ["صوتية", "مايك", "voice"],
  رسالة: ["رسائل", "محادثة", "كلام"],
  صورة: ["صور", "image", "photo"],
  دعوة: ["دعوه", "invite"]
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return [...new Set(normalizeText(value)
    .split(/[\s_-]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP_WORDS.has(token)))];
}

function safeString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeInterestList(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || "").split(/[,،\n]/g);
  return [...new Set(values
    .map(item => safeString(item, 32).replace(/[<>]/g, "").trim())
    .filter(item => item.length >= 2))].slice(0, 12);
}

function createTomiAiService(options = {}) {
  const getDb = typeof options.getDb === "function" ? options.getDb : () => ({});
  const getUser = typeof options.getUser === "function" ? options.getUser : username => getDb()?.users?.[username];
  const canAccessRoom = typeof options.canAccessRoom === "function" ? options.canAccessRoom : () => false;
  const getRoomLabel = typeof options.getRoomLabel === "function"
    ? options.getRoomLabel
    : (roomId, room) => room?.roomName || room?.name || roomId;
  const persist = typeof options.persist === "function" ? options.persist : () => {};
  const emitStaff = typeof options.emitStaff === "function" ? options.emitStaff : () => {};
  const notifyStaff = typeof options.notifyStaff === "function" ? options.notifyStaff : async () => {};
  const getAnalyticsSnapshot = typeof options.getAnalyticsSnapshot === "function"
    ? options.getAnalyticsSnapshot
    : async () => ({});
  const ownerUsername = String(options.ownerUsername || "tomi");

  const remoteEnabled = String(process.env.AI_REMOTE_ENABLED || "false").toLowerCase() === "true";
  const remoteSafetyEnabled = String(process.env.AI_REMOTE_SAFETY_ENABLED || "false").toLowerCase() === "true";
  const apiKey = String(process.env.AI_API_KEY || "").trim();
  const apiUrl = String(process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions").trim();
  const model = String(process.env.AI_MODEL || "gpt-4o-mini").trim();
  const timeoutMs = clamp(Number(process.env.AI_TIMEOUT_MS || 8000) || 8000, 2500, 30000);
  const recentMessageLimit = 2500;
  const recentMessages = new Map();
  const scannedMessageIds = new Set();

  function ensureState() {
    const db = getDb();
    if (!db.aiPreferences || typeof db.aiPreferences !== "object") db.aiPreferences = {};
    if (!db.aiModerationAlerts || typeof db.aiModerationAlerts !== "object") db.aiModerationAlerts = {};
    return db;
  }

  function getPreferences(username) {
    const db = ensureState();
    const user = String(username || "").trim();
    if (!user) return { interests: [], updatedAt: null };
    const raw = db.aiPreferences[user] || {};
    return {
      interests: safeInterestList(raw.interests),
      updatedAt: raw.updatedAt || null
    };
  }

  function setPreferences(username, interests) {
    const db = ensureState();
    const user = String(username || "").trim();
    const clean = safeInterestList(interests);
    if (!user) return { interests: clean, updatedAt: null };
    db.aiPreferences[user] = { interests: clean, updatedAt: new Date().toISOString() };
    const account = getUser(user);
    if (account) account.aiInterests = clean;
    persist();
    return db.aiPreferences[user];
  }

  function findFaq(question) {
    const clean = normalizeText(question);
    const tokens = tokenize(question);
    let best = null;
    let bestScore = 0;
    for (const entry of FAQ_ENTRIES) {
      const keywords = entry.keywords.map(normalizeText);
      let score = 0;
      for (const token of tokens) {
        if (keywords.some(keyword => keyword === token || keyword.includes(token) || token.includes(keyword))) score += 2;
      }
      if (clean.includes(normalizeText(entry.title))) score += 4;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  function localAnswer(question) {
    const cleanQuestion = safeString(question, 800);
    const faq = findFaq(cleanQuestion);
    if (faq) {
      return {
        answer: faq.answer,
        source: "local-faq",
        matchedTopic: faq.id,
        suggestions: FAQ_ENTRIES.filter(item => item.id !== faq.id).slice(0, 3).map(item => item.title)
      };
    }
    if (/مساعد|مساعدة|ساعدني|help|support|دعم/i.test(cleanQuestion)) {
      return {
        answer: "أكيد. أگدر أشرح لك الغرف، الدعوات، الإشعارات، رفع الملفات، الخصوصية والبلاغات. اختَر موضوعاً من الاقتراحات أو اكتب سؤالك بالتفصيل.",
        source: "local-help",
        suggestions: FAQ_ENTRIES.slice(0, 5).map(item => item.title)
      };
    }
    return {
      answer: "ما لكيت جواباً مطابقاً تماماً. جرّب تسأل عن إنشاء غرفة، دعوة صديق، الإشعارات، رفع فيديو، الغرف الصوتية أو البحث داخل محادثاتك.",
      source: "local-help",
      suggestions: FAQ_ENTRIES.slice(0, 6).map(item => item.title)
    };
  }

  async function callRemote(messages, maxTokens = 450) {
    if (!remoteEnabled || !apiKey || typeof fetch !== "function") return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages
        })
      });
      if (!response.ok) return "";
      const payload = await response.json().catch(() => ({}));
      return safeString(
        payload?.choices?.[0]?.message?.content || payload?.output_text || payload?.response || "",
        5000
      );
    } catch (_) {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async function answerQuestion(username, question, context = {}) {
    const local = localAnswer(question);
    const remote = await callRemote([
      {
        role: "system",
        content: "أنت مساعد TOMI. أجب بالعربية العراقية الواضحة وباختصار. اشرح خصائص الموقع فقط. لا تطلب كلمات مرور أو رموز تحقق، ولا تدّعي أنك نفذت إجراءً لم ينفذ. لا يوجد محتوى محادثة خاص ضمن السياق."
      },
      {
        role: "user",
        content: JSON.stringify({
          question: safeString(question, 800),
          faqTopics: FAQ_ENTRIES.map(item => ({ title: item.title, answer: item.answer })),
          requestedMode: context.mode || "help"
        })
      }
    ]);
    return {
      ...local,
      answer: remote || local.answer,
      source: remote ? "remote-ai" : local.source,
      username: String(username || "")
    };
  }

  function accessibleRoomIds(username) {
    const db = ensureState();
    return Object.keys(db.rooms || {}).filter(roomId => {
      try { return canAccessRoom(roomId, username); } catch (_) { return false; }
    });
  }

  function searchMessages(username, query, limit = 40) {
    const db = ensureState();
    const cleanQuery = safeString(query, 240);
    const queryTokens = tokenize(cleanQuery);
    if (!cleanQuery || !queryTokens.length) return { query: cleanQuery, results: [], privacy: "user-only" };

    const expanded = new Set(queryTokens);
    for (const token of queryTokens) {
      for (const synonym of SEARCH_SYNONYMS[token] || []) expanded.add(normalizeText(synonym));
    }

    const results = [];
    for (const roomId of accessibleRoomIds(username)) {
      const room = db.rooms?.[roomId] || {};
      const history = Array.isArray(db.roomHistory?.[roomId]) ? db.roomHistory[roomId] : [];
      for (const message of history) {
        if (!message || message.deleted || message.type !== "text") continue;
        const body = safeString(message.msg, 20000);
        const normalizedBody = normalizeText(body);
        const searchable = `${normalizedBody} ${normalizeText(room.roomName || room.name || "")}`;
        let score = 0;
        for (const token of expanded) {
          if (searchable.includes(token)) score += queryTokens.includes(token) ? 2 : 1;
        }
        if (normalizedBody.includes(normalizeText(cleanQuery))) score += 5;
        if (!score) continue;
        const index = normalizedBody.indexOf(normalizeText(queryTokens[0] || cleanQuery));
        const start = index >= 0 ? Math.max(0, index - 70) : 0;
        const preview = body.slice(start, start + 220);
        results.push({
          msgId: String(message.msgId || ""),
          roomId,
          roomName: safeString(getRoomLabel(roomId, room), 100),
          sender: safeString(message.displayName || message.username || message.userId, 80),
          senderUsername: safeString(message.userId || message.username, 80),
          preview,
          createdAt: message.createdAt || null,
          time: message.time || "",
          score
        });
      }
    }
    results.sort((a, b) => b.score - a.score || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    return {
      query: cleanQuery,
      results: results.slice(0, clamp(Number(limit) || 40, 1, 80)),
      total: results.length,
      privacy: "user-only"
    };
  }

  function getFriendSet(username) {
    const db = ensureState();
    const friends = new Set();
    for (const friend of Object.values(db.friends || {})) {
      if (!friend || typeof friend !== "object") continue;
      if (friend.user1 === username) friends.add(friend.user2);
      if (friend.user2 === username) friends.add(friend.user1);
    }
    return friends;
  }

  function getRecommendations(username) {
    const db = ensureState();
    const preferences = getPreferences(username);
    const interests = preferences.interests.map(normalizeText).filter(Boolean);
    const friendSet = getFriendSet(username);
    const roomResults = [];
    for (const [roomId, room] of Object.entries(db.rooms || {})) {
      if (!room || room.isPrivate || room.systemRoom) continue;
      const members = Array.isArray(room.members) ? room.members : [];
      if (members.includes(username)) continue;
      const history = Array.isArray(db.roomHistory?.[roomId]) ? db.roomHistory[roomId] : [];
      const searchable = normalizeText([
        room.roomName,
        room.name,
        room.description,
        room.topic,
        ...history.slice(-8).map(message => message?.type === "text" ? message.msg : "")
      ].filter(Boolean).join(" "));
      let score = Math.min(4, members.length / 8) + Math.min(3, history.length / 12);
      const matchedInterests = [];
      for (const interest of interests) {
        if (searchable.includes(interest)) {
          score += 5;
          matchedInterests.push(interest);
        }
      }
      roomResults.push({
        roomId,
        name: safeString(room.roomName || room.name || "غرفة عامة", 100),
        memberCount: members.length,
        shareCode: room.shareCode || null,
        matchedInterests,
        reason: matchedInterests.length ? `تناسب اهتمامك: ${matchedInterests.join("، ")}` : "نشاط جيد في الغرفة",
        score
      });
    }

    const userResults = [];
    for (const [candidate, user] of Object.entries(db.users || {})) {
      if (!user || candidate === username || friendSet.has(candidate) || candidate === ownerUsername) continue;
      const searchable = normalizeText(`${candidate} ${user.displayName || ""} ${(user.aiInterests || []).join(" ")}`);
      let score = 0;
      const matchedInterests = [];
      for (const interest of interests) {
        if (searchable.includes(interest)) {
          score += 5;
          matchedInterests.push(interest);
        }
      }
      if (user.status === "online") score += 1;
      if (score > 0) {
        userResults.push({
          username: candidate,
          displayName: safeString(user.displayName || candidate, 80),
          avatar: user.avatar || "",
          isOnline: user.status === "online",
          matchedInterests,
          reason: `اهتمامات مشتركة: ${matchedInterests.join("، ")}`,
          score
        });
      }
    }

    roomResults.sort((a, b) => b.score - a.score);
    userResults.sort((a, b) => b.score - a.score);
    return {
      interests: preferences.interests,
      needsInterests: preferences.interests.length === 0,
      rooms: roomResults.slice(0, 8).map(({ score, ...item }) => item),
      friends: userResults.slice(0, 8).map(({ score, ...item }) => item)
    };
  }

  function extractUrls(text) {
    return safeString(text, 20000).match(/https?:\/\/[^\s<>()]+/gi) || [];
  }

  function analyzeMessage(message, { trackRecent = true } = {}) {
    const text = safeString(message?.msg, 20000);
    const normalized = normalizeText(text);
    const username = safeString(message?.userId || message?.username, 80);
    const reasons = [];
    const categories = new Set();
    let score = 0;
    const urls = extractUrls(text);

    if (urls.length >= 3) {
      categories.add("spam");
      reasons.push("عدة روابط في رسالة واحدة");
      score += 0.55;
    }
    if (urls.some(url => /bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|shorturl|goo\.gl/i.test(url))) {
      categories.add("suspicious-link");
      reasons.push("رابط مختصر يحتاج مراجعة");
      score += 0.65;
    }
    if (urls.some(url => /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i.test(url))) {
      categories.add("suspicious-link");
      reasons.push("الرابط يستخدم عنوان IP مباشر");
      score += 0.55;
    }
    if (/(اربح|ربح مضمون|جائزة|تحويل اموال|تحويل أموال|استثمار مضمون|ضاعف فلوسك|كود التفعيل|رمز التحقق|كلمه المرور|كلمة المرور|send money|free money|crypto|giveaway)/i.test(normalized)) {
      categories.add("scam");
      reasons.push("صياغة تشبه عروضاً احتيالية أو طلب بيانات حساسة");
      score += 0.72;
    }
    if (/(راح اقتلك|راح أقتلك|اقتلك|أقتلك|اذبحك|أذبحك|افجر|أفجر|اذيك|أذيك|قتل|kill you|hurt you|bomb)/i.test(normalized)) {
      categories.add("threat");
      reasons.push("عبارات تهديد");
      score += 0.95;
    }
    if (/(غبي|حيوان|تافه|سافل|كلب|قندرت|fuck you|idiot|stupid)/i.test(normalized)) {
      categories.add("abuse");
      reasons.push("عبارات إساءة أو مضايقة");
      score += 0.62;
    }

    if (/(اباحي|جنس(?:ي|يه)?|عاري|تعري|صور عاريه|محتوي جنسي|porn(?:ography)?|nude|nsfw|explicit sex|sexual content)/i.test(normalized)) {
      categories.add("sexual-content");
      reasons.push("محتوى جنسي صريح يحتاج مراجعة المالك");
      score += 1;
    }

    if (trackRecent) {
      const previous = recentMessages.get(username) || [];
      const now = Date.now();
      const recent = previous.filter(item => now - item.at < 90_000);
      const duplicateCount = recent.filter(item => item.text === normalized && normalized.length > 8).length;
      if (duplicateCount >= 2) {
        categories.add("spam");
        reasons.push("تكرار الرسالة عدة مرات خلال وقت قصير");
        score += 0.65;
      }
      if (normalized.length > 0 && /(.)\1{11,}/u.test(normalized.replace(/\s/g, ""))) {
        categories.add("spam");
        reasons.push("تكرار حروف غير طبيعي");
        score += 0.35;
      }
      recent.push({ text: normalized, at: now });
      recentMessages.set(username, recent.slice(-12));
    }

    return {
      flagged: score >= 0.55,
      score: Number(Math.min(1, score).toFixed(2)),
      categories: [...categories],
      reasons: [...new Set(reasons)],
      urls: urls.slice(0, 5),
      engine: "local-safety-rules-v1"
    };
  }

  async function remoteSafetyReview(message) {
    if (!remoteSafetyEnabled) return null;
    const response = await callRemote([
      {
        role: "system",
      content: "صنّف النص لأغراض سلامة منصة اجتماعية. أعد JSON فقط بالشكل {flagged:boolean,score:number,categories:string[],reasons:string[]}. الفئات المسموحة: spam,suspicious-link,scam,abuse,threat,sexual-content. لا تذكر نص الرسالة في النتيجة."
      },
      { role: "user", content: JSON.stringify({ text: safeString(message?.msg, 1200) }) }
    ], 220);
    if (!response) return null;
    try {
      const match = response.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : response);
      const categories = Array.isArray(parsed.categories)
        ? parsed.categories.filter(item => ["spam", "suspicious-link", "scam", "abuse", "threat", "sexual-content"].includes(item)).slice(0, 6)
        : [];
      const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(item => safeString(item, 160)).filter(Boolean).slice(0, 5) : [];
      return {
        flagged: Boolean(parsed.flagged) && categories.length > 0,
        score: clamp(Number(parsed.score) || 0, 0, 1),
        categories,
        reasons,
        engine: "remote-safety-review"
      };
    } catch (_) {
      return null;
    }
  }

  function createAlert(message, analysis) {
    const db = ensureState();
    const messageId = safeString(message?.msgId, 160);
    const existing = Object.values(db.aiModerationAlerts).find(item => item?.messageId === messageId);
    if (existing) return existing;

    const alertId = `ai_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
    const alert = {
      alertId,
      roomId: safeString(message?.roomId, 160),
      roomName: safeString(message?.roomName || "", 100),
      messageId,
      sender: safeString(message?.userId || message?.username, 80),
      senderDisplayName: safeString(message?.displayName || message?.userId || message?.username, 100),
      preview: safeString(message?.msg, 500),
      source: safeString(message?.source, 40),
      postId: safeString(message?.postId, 160),
      categories: analysis.categories,
      reasons: analysis.reasons,
      score: analysis.score,
      engine: analysis.engine,
      status: "pending",
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      resolution: ""
    };
    db.aiModerationAlerts[alertId] = alert;
    const entries = Object.entries(db.aiModerationAlerts)
      .sort(([, a], [, b]) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
      .slice(0, 500);
    db.aiModerationAlerts = Object.fromEntries(entries);
    persist();
    emitStaff("manage_ai_safety", "ai-moderation-alert", alert);
    Promise.resolve(notifyStaff(alert)).catch(() => {});
    return alert;
  }

  async function scanMessage(message) {
    const messageId = safeString(message?.msgId, 160);
    if (!messageId || scannedMessageIds.has(messageId) || !safeString(message?.msg, 1)) return null;
    scannedMessageIds.add(messageId);
    if (scannedMessageIds.size > recentMessageLimit) {
      const first = scannedMessageIds.values().next().value;
      if (first) scannedMessageIds.delete(first);
    }
    const local = analyzeMessage(message);
    const remote = local.flagged ? null : await remoteSafetyReview(message);
    const final = remote?.flagged
      ? { ...remote, reasons: [...new Set(remote.reasons)], categories: [...new Set(remote.categories)] }
      : local;
    return final.flagged ? createAlert(message, final) : null;
  }

  async function reviewPublicContent({ postId, username, displayName, text, type } = {}) {
    const cleanText = safeString(text, 700);
    const message = {
      msgId: `explore_${safeString(postId, 120)}`,
      postId: safeString(postId, 120),
      source: "explore",
      roomId: "explore",
      roomName: "اكسبلور • منشور قيد المراجعة",
      userId: safeString(username, 80),
      displayName: safeString(displayName || username, 100),
      msg: cleanText
    };
    let local = analyzeMessage(message, { trackRecent: false });
    const remote = cleanText ? await remoteSafetyReview(message) : null;
    if (remote?.flagged) {
      local = {
        flagged: true,
        score: Math.max(local.score, remote.score),
        categories: [...new Set([...local.categories, ...remote.categories])],
        reasons: [...new Set([...local.reasons, ...remote.reasons])],
        urls: local.urls,
        engine: `${local.engine}+${remote.engine}`
      };
    }
    if (local.flagged) createAlert(message, local);
    return {
      flagged: local.flagged,
      score: local.score,
      categories: local.categories,
      reasons: local.reasons,
      engine: local.engine,
      type: type === "video" ? "video" : "note"
    };
  }

  function listAlerts({ status = "pending", limit = 100 } = {}) {
    const db = ensureState();
    const rows = Object.values(db.aiModerationAlerts || {})
      .filter(item => !status || status === "all" || item.status === status)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    return { total: rows.length, alerts: rows.slice(0, clamp(Number(limit) || 100, 1, 300)) };
  }

  function reviewAlert(alertId, actor, status, resolution) {
    const db = ensureState();
    const alert = db.aiModerationAlerts?.[alertId];
    if (!alert) return null;
    alert.status = ["reviewing", "actioned", "dismissed"].includes(status) ? status : "reviewing";
    alert.resolution = safeString(resolution, 1000);
    alert.reviewedBy = safeString(actor, 80);
    alert.reviewedAt = new Date().toISOString();
    persist();
    return alert;
  }

  function findReferralCode(question) {
    const match = safeString(question, 800).match(/[A-Za-z0-9]{2,}(?:-[A-Za-z0-9_-]+)?/g) || [];
    return match.find(item => /-/.test(item)) || match.find(item => /^[A-Z0-9_-]{4,}$/i.test(item)) || "";
  }

  async function answerAnalyticsQuestion(actor, question, range = {}) {
    const snapshot = await getAnalyticsSnapshot({ ...range, actor });
    const overview = snapshot?.overview || {};
    const timeseries = Array.isArray(snapshot?.timeseries) ? snapshot.timeseries : [];
    const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
    const referrals = Array.isArray(snapshot?.referrals) ? snapshot.referrals : [];
    const explore = snapshot?.explore || {};
    const moderation = snapshot?.moderation || {};
    const clean = normalizeText(question);
    let answer = "";

    const peak = timeseries.reduce((best, item) => {
      const value = Number(item?.peakOnline || item?.activeUsers || item?.sessions || 0);
      return value > Number(best?.value || 0) ? { item, value } : best;
    }, null);
    if (/اكسبلور|استكشاف|منشورات|محتوى اباحي|محتوي اباحي|مراجعه المحتوى|مراجعة المحتوى|تنبيهات السلامه|تنبيهات السلامة/.test(clean)) {
      if (/اباحي|اباحيه|جنسي|مخالف|سلامه|سلامة|تنبيه/.test(clean)) {
        answer = `خلال الفترة المحددة: ${Number(moderation.pendingAlerts || 0)} تنبيه أمان بانتظار المراجعة، منها ${Number(moderation.sexualContentAlerts || 0)} تنبيه مرتبط بمحتوى جنسي. في اكسبلور ${Number(explore.flaggedPending || 0)} طلباً عليه إشارة آلية.`;
      } else {
        answer = `إحصائيات اكسبلور للفترة: ${Number(explore.published || 0)} منشوراً منشوراً، ${Number(explore.pending || 0)} بانتظار المراجعة، و${Number(explore.rejected || 0)} مرفوضاً. الطلبات التي عليها تنبيه آلي: ${Number(explore.flaggedPending || 0)}.`;
      }
    } else if (/ضغط|ذروه|ذروة|اوقات|أوقات|وقت النشاط|نشاط الموقع/.test(clean)) {
      answer = peak?.item
        ? `أعلى ضغط مسجل كان تقريباً ${peak.value} مستخدم عند ${new Date(peak.item.bucketStart).toLocaleString("ar-IQ")}.`
        : "لا توجد نقاط زمنية كافية حتى أحدد وقت الضغط الأعلى.";
    } else if (/مستخدم جديد|جدد|جديد|اليوم/.test(clean)) {
      const today = snapshot?.todayOverview || {};
      answer = `عدد المستخدمين الجدد اليوم: ${Number(today.newUsers || overview.newUsers || 0).toLocaleString("ar-IQ")} مستخدم.`;
    } else if (/غرفه|غرفة|روم/.test(clean) && /نشاط|اكثر|أكثر|اعلى|أعلى/.test(clean)) {
      const room = rooms[0];
      answer = room
        ? `أكثر غرفة نشاطاً حالياً هي «${room.name}» وبها ${Number(room.messages || 0).toLocaleString("ar-IQ")} رسالة ضمن الفترة.`
        : "لا توجد بيانات كافية عن نشاط الغرف.";
    } else if (/احاله|إحالة|احالات|إحالات|رابط/.test(clean)) {
      const code = findReferralCode(question);
      const row = code ? referrals.find(item => String(item.code || "").toLowerCase() === code.toLowerCase()) : referrals[0];
      answer = row
        ? `رمز الإحالة ${row.code} سجّل ${Number(row.clicks || 0).toLocaleString("ar-IQ")} زيارة و${Number(row.registrations || 0).toLocaleString("ar-IQ")} تسجيل، بنسبة تحويل ${Number(row.conversionRate || 0).toFixed(1)}%.`
        : "لا توجد بيانات إحالة مطابقة. تأكد من كتابة رمز الإحالة أو امنح الحساب صلاحية عرض الإحالات.";
    } else if (/غير طبيعي|شاذ|انهيار|مشكله|مشكلة|خطر|خطا|خطأ|سيرفر/.test(clean)) {
      const alerts = [];
      if (Number(overview.errorRate || 0) >= 5) alerts.push(`نسبة الأخطاء ${Number(overview.errorRate).toFixed(1)}%`);
      if (Number(overview.p95LatencyMs || 0) >= 1000) alerts.push(`p95 الاستجابة ${Math.round(overview.p95LatencyMs)}ms`);
      if (Number(overview.uploadSuccessRate || 100) < 95 && Number(overview.uploadsStarted || 0) > 0) alerts.push(`نجاح الرفع ${Number(overview.uploadSuccessRate).toFixed(1)}%`);
      if (Number(overview.memory?.rssMB || 0) >= Number(overview.memory?.warnAtMB || Infinity)) alerts.push(`RSS الذاكرة ${overview.memory.rssMB}MB`);
      answer = alerts.length ? `توجد مؤشرات تحتاج متابعة: ${alerts.join("، ")}.` : "لا يظهر ارتفاع غير طبيعي واضح في المؤشرات المتاحة خلال الفترة المحددة.";
    } else {
      answer = `ملخص الفترة: ${Number(overview.newUsers || 0).toLocaleString("ar-IQ")} مستخدم جديد، ${Number(overview.activeNow || 0).toLocaleString("ar-IQ")} نشط الآن، ${Number(overview.messagesSent || 0).toLocaleString("ar-IQ")} رسالة، ونسبة أخطاء ${Number(overview.errorRate || 0).toFixed(1)}%.`;
    }

    const remote = await callRemote([
      {
        role: "system",
        content: "أنت محلل TOMI. أجب بالعربية العراقية باختصار اعتماداً على أرقام مجمعة فقط. لا تخترع أرقاماً ولا تكشف محتوى رسائل أو بيانات شخصية. إذا لم تتضمن المقاييس معلومة فقل إنها غير متاحة."
      },
      { role: "user", content: JSON.stringify({ question: safeString(question, 800), answerDraft: answer, metrics: { overview, rooms: rooms.slice(0, 10), referrals: referrals.slice(0, 10), explore, moderation } }) }
    ], 350);
    return {
      question: safeString(question, 800),
      answer: remote || answer,
      source: remote ? "remote-ai" : "local-analytics-ai",
      period: snapshot?.period || null,
      metrics: {
        peak: peak ? { value: peak.value, at: peak.item?.bucketStart || null } : null,
        newUsersToday: Number(snapshot?.todayOverview?.newUsers || overview.newUsers || 0),
        topRoom: rooms[0] || null
      }
    };
  }

  return {
    getHelpCatalog: () => ({ faq: FAQ_ENTRIES, cards: HELP_CARDS }),
    answerQuestion,
    searchMessages,
    getPreferences,
    setPreferences,
    getRecommendations,
    scanMessage,
    reviewPublicContent,
    listAlerts,
    reviewAlert,
    answerAnalyticsQuestion,
    remoteConfigured: () => Boolean(remoteEnabled && apiKey)
  };
}

module.exports = { createTomiAiService };
