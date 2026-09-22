(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const socket = typeof io === "function" ? io({ autoConnect: false }) : null;
  const state = { username: "", isOwner: false, canReview: false, type: "note", feed: [], queue: [], loading: false };

  function toast(message, error = false) {
    const box = $("toast");
    if (!box) return;
    box.textContent = message || "";
    box.classList.toggle("error", error);
    box.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.remove("show"), 4200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: options.body instanceof FormData
        ? (options.headers || {})
        : { "content-type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = "/login.html";
      throw new Error("سجّل الدخول أولاً");
    }
    if (!response.ok || data.success === false) throw new Error(data.error || "تعذر إكمال الطلب");
    return data;
  }

  function dateLabel(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return "الآن";
    return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function makeAuthor(author = {}) {
    const wrap = document.createElement("div");
    wrap.className = "post-head";
    const image = document.createElement("img");
    image.className = "avatar";
    image.alt = "";
    image.src = author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.displayName || author.username || "TOMI")}&background=55428b&color=fff`;
    image.onerror = () => {
      image.onerror = null;
      image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23302a4a'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='27' fill='%23c4b5fd'%3ET%3C/text%3E%3C/svg%3E";
    };
    const text = document.createElement("div");
    text.className = "author";
    const name = document.createElement("strong");
    name.textContent = author.displayName || author.username || "مستخدم TOMI";
    if (author.charisma?.level) {
      const charisma = document.createElement("span");
      charisma.className = "charisma";
      charisma.textContent = `${author.charisma.icon || "✨"} كارزما ${Number(author.charisma.level)}`;
      name.appendChild(charisma);
    }
    const username = document.createElement("small");
    username.textContent = author.username ? `@${author.username}` : "";
    text.append(name, username);
    wrap.append(image, text);
    return wrap;
  }

  function emptyBox(message) {
    const box = document.createElement("div");
    box.className = "empty-box";
    box.textContent = message;
    return box;
  }

  function renderFeed() {
    const host = $("feedList");
    if (!host) return;
    host.replaceChildren();
    if (!state.feed.length) {
      host.appendChild(emptyBox("ماكو منشورات منشورة حالياً. تقدر ترسل أول منشور للمراجعة."));
      return;
    }
    state.feed.forEach(post => {
      const card = document.createElement("article");
      card.className = `post-card${post.pinned ? " is-pinned" : ""}`;
      if (post.pinned) {
        const pinBadge = document.createElement("div");
        pinBadge.className = "pinned-badge";
        pinBadge.innerHTML = '<i class="fa-solid fa-thumbtack" aria-hidden="true"></i>';
        const pinText = document.createElement("span");
        pinText.textContent = "منشور مثبت";
        pinBadge.appendChild(pinText);
        card.appendChild(pinBadge);
      }
      card.appendChild(makeAuthor(post.author));
      if (post.type === "video" && post.fileUrl) {
        if (post.caption) {
          const caption = document.createElement("p");
          caption.className = "post-caption";
          caption.textContent = post.caption;
          card.appendChild(caption);
        }
        const video = document.createElement("video");
        video.className = "post-video";
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = post.fileUrl;
        card.appendChild(video);
      } else {
        const body = document.createElement("p");
        body.className = "post-text";
        body.textContent = post.text || "";
        card.appendChild(body);
      }
      const time = document.createElement("div");
      time.className = "post-time";
      time.innerHTML = '<i class="fa-regular fa-clock" aria-hidden="true"></i>';
      const timeText = document.createElement("span");
      timeText.textContent = dateLabel(post.createdAt);
      time.appendChild(timeText);
      card.appendChild(time);
      if (state.canReview) {
        const pinActions = document.createElement("div");
        pinActions.className = "post-pin-row";
        const pinButton = document.createElement("button");
        pinButton.className = `post-pin-btn${post.pinned ? " active" : ""}`;
        pinButton.type = "button";
        pinButton.innerHTML = post.pinned
          ? '<i class="fa-solid fa-thumbtack" aria-hidden="true"></i> إلغاء التثبيت'
          : '<i class="fa-solid fa-thumbtack" aria-hidden="true"></i> تثبيت المنشور';
        pinButton.addEventListener("click", () => togglePostPin(post, pinButton));
        pinActions.appendChild(pinButton);
        card.appendChild(pinActions);
      }
      host.appendChild(card);
    });
  }

  async function togglePostPin(post, button) {
    button.disabled = true;
    try {
      const data = await request(`/api/explore/posts/${encodeURIComponent(post.id)}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: !post.pinned })
      });
      toast(data.message || "تم تحديث تثبيت المنشور");
      await loadPage({ queue: false });
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  }

  function renderSubmissions(items = []) {
    const host = $("mySubmissions");
    if (!host) return;
    host.replaceChildren();
    if (!items.length) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "ما عندك طلبات حديثة.";
      host.appendChild(note);
      return;
    }
    items.slice(0, 8).forEach(item => {
      const row = document.createElement("div");
      row.className = "submission-row";
      const label = document.createElement("div");
      label.textContent = item.type === "video" ? "فيديو اكسبلور" : "ملاحظة اكسبلور";
      const hint = document.createElement("small");
      hint.textContent = item.status === "pending" ? "بانتظار المراجعة" : (item.reason || dateLabel(item.decidedAt));
      label.appendChild(hint);
      const badge = document.createElement("span");
      badge.className = `status ${item.status || "pending"}`;
      badge.textContent = item.status === "published" ? "نُشر" : item.status === "rejected" ? "مرفوض" : "قيد المراجعة";
      row.append(label, badge);
      host.appendChild(row);
    });
  }

  function renderReviewQueue() {
    const host = $("reviewList");
    if (!host) return;
    host.replaceChildren();
    $("pendingCount").textContent = String(state.queue.length);
    if (!state.queue.length) {
      host.appendChild(emptyBox("قائمة المراجعة فارغة."));
      return;
    }
    state.queue.forEach(post => {
      const card = document.createElement("article");
      card.className = "review-card";
      card.appendChild(makeAuthor(post.author));
      const flagged = Boolean(post.moderation?.flagged);
      const categories = Array.isArray(post.moderation?.categories) ? post.moderation.categories : [];
      const risk = document.createElement("div");
      risk.className = `risk-label${flagged ? "" : " clean"}`;
      risk.textContent = flagged
        ? `تنبيه آلي: ${categories.join("، ") || "نص يحتاج مراجعة"}`
        : "لم تظهر إشارة نصية واضحة في الفحص الآلي";
      card.appendChild(risk);
      if (post.type === "video" && post.fileUrl) {
        if (post.caption) {
          const caption = document.createElement("p");
          caption.className = "post-caption";
          caption.textContent = post.caption;
          card.appendChild(caption);
        }
        const video = document.createElement("video");
        video.className = "post-video";
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = post.fileUrl;
        card.appendChild(video);
      } else {
        const body = document.createElement("p");
        body.className = "post-text";
        body.textContent = post.text || "";
        card.appendChild(body);
      }
      const footer = document.createElement("div");
      footer.className = "post-time";
      footer.textContent = `أُرسل ${dateLabel(post.createdAt)}`;
      card.appendChild(footer);
      const actions = document.createElement("div");
      actions.className = "review-actions";
      const reject = document.createElement("button");
      reject.className = "review-action reject";
      reject.type = "button";
      reject.innerHTML = '<i class="fa-solid fa-xmark"></i> رفض';
      reject.addEventListener("click", () => reviewPost(post.id, "reject"));
      const approve = document.createElement("button");
      approve.className = "review-action";
      approve.type = "button";
      approve.innerHTML = '<i class="fa-solid fa-check"></i> موافقة ونشر';
      approve.addEventListener("click", () => reviewPost(post.id, "approve"));
      actions.append(reject, approve);
      card.appendChild(actions);
      host.appendChild(card);
    });
  }

  async function loadReviewQueue() {
    if (!state.canReview) return;
    try {
      const data = await request("/api/explore/review");
      state.queue = Array.isArray(data.queue) ? data.queue : [];
      renderReviewQueue();
    } catch (error) { toast(error.message, true); }
  }

  async function loadPage({ queue = true } = {}) {
    if (state.loading) return;
    state.loading = true;
    try {
      const data = await request("/api/explore");
      state.feed = Array.isArray(data.posts) ? data.posts : [];
      state.isOwner = Boolean(data.isOwner);
      state.canReview = Boolean(data.canReview);
      $("composerDescription").textContent = state.isOwner
        ? "اختر ملاحظة قصيرة أو فيديو حتى 150 ميغابايت؛ منشورات المالك تظهر مباشرة."
        : "اختر ملاحظة قصيرة أو فيديو حتى 150 ميغابايت؛ منشورك ينتظر موافقة المالك أو المشرف.";
      $("noteHint").textContent = state.isOwner ? "ستنشر ملاحظتك مباشرة للجميع" : "تظهر الملاحظة للجميع بعد الموافقة";
      $("reviewNoteText").textContent = state.isOwner
        ? "منشور المالك ينشر مباشرة في اكسبلور."
        : "يراجع المالك أو المشرف منشورك قبل ظهوره للجميع.";
      $("submitPost").innerHTML = state.isOwner
        ? '<i class="fa-solid fa-paper-plane"></i> نشر مباشرة'
        : '<i class="fa-solid fa-paper-plane"></i> إرسال للمراجعة';
      $("pendingCount").textContent = String(data.pendingCount || 0);
      $("reviewTab").hidden = !state.canReview;
      $("meName").textContent = localStorage.getItem("chat_display_name") || data.username || localStorage.getItem("chat_username") || "TOMI";
      renderFeed();
      renderSubmissions(data.mySubmissions || []);
      if (queue && state.canReview) await loadReviewQueue();
      if (socket && !socket.connected) socket.connect();
    } catch (error) {
      if (!String(error.message).includes("سجّل الدخول")) toast(error.message, true);
    } finally {
      state.loading = false;
    }
  }

  async function reviewPost(postId, decision) {
    const reason = decision === "reject" ? (prompt("سبب الرفض (اختياري):") || "") : "";
    const buttons = $("reviewList").querySelectorAll("button");
    buttons.forEach(button => { button.disabled = true; });
    try {
      const data = await request(`/api/explore/posts/${encodeURIComponent(postId)}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, reason })
      });
      toast(data.message || "تم تحديث المنشور");
      await loadPage();
    } catch (error) {
      toast(error.message, true);
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function setType(type) {
    state.type = type === "video" ? "video" : "note";
    document.querySelectorAll(".type-option").forEach(button => button.classList.toggle("active", button.dataset.type === state.type));
    $("noteFields").hidden = state.type !== "note";
    $("videoFields").hidden = state.type !== "video";
    $("noteText").required = state.type === "note";
    $("videoFile").required = state.type === "video";
  }

  async function submitPost(event) {
    event.preventDefault();
    const button = $("submitPost");
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';
    try {
      let payload;
      if (state.type === "video") {
        const file = $("videoFile").files?.[0];
        if (!file) throw new Error("اختر فيديو أولاً");
        if (!file.type.startsWith("video/")) throw new Error("الملف المختار ليس فيديو");
        if (file.size > 150 * 1024 * 1024) throw new Error("الحد الأعلى لفيديو اكسبلور هو 150 ميغابايت");
        const form = new FormData();
        form.append("file", file);
        form.append("context", "explore-video");
        form.append("clientFileType", "video");
        const upload = await request("/api/upload", { method: "POST", body: form });
        payload = { type: "video", fileId: upload.fileId, caption: $("videoCaption").value.trim() };
      } else {
        payload = { type: "note", text: $("noteText").value.trim() };
      }
      const data = await request("/api/explore/posts", { method: "POST", body: JSON.stringify(payload) });
      $("postForm").reset();
      $("videoName").textContent = "MP4 أو صيغة فيديو مدعومة • الحد 150 ميغابايت";
      setType("note");
      toast(data.message || "تم إرسال طلبك للمراجعة");
      await loadPage();
    } catch (error) {
      toast(error.message || "تعذر إرسال المنشور", true);
    } finally {
      button.disabled = false;
      button.innerHTML = state.isOwner
        ? '<i class="fa-solid fa-paper-plane"></i> نشر مباشرة'
        : '<i class="fa-solid fa-paper-plane"></i> إرسال للمراجعة';
    }
  }

  function showPane(which) {
    const review = which === "review" && state.canReview;
    $("feedPane").hidden = review;
    $("reviewPane").hidden = !review;
    $("feedPane").style.display = review ? "none" : "grid";
    $("reviewPane").style.display = review ? "grid" : "none";
    $("feedTab").classList.toggle("active", !review);
    $("reviewTab").classList.toggle("active", review);
    if (review) loadReviewQueue();
  }

  document.querySelectorAll(".type-option").forEach(button => button.addEventListener("click", () => setType(button.dataset.type)));
  $("postForm").addEventListener("submit", submitPost);
  $("noteText").addEventListener("input", () => { $("noteCount").textContent = `${$("noteText").value.length} / 500`; });
  $("videoFile").addEventListener("change", () => {
    const file = $("videoFile").files?.[0];
    $("videoName").textContent = file ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(1)} MB` : "MP4 أو صيغة فيديو مدعومة • الحد 150 ميغابايت";
  });
  $("feedTab").addEventListener("click", () => showPane("feed"));
  $("reviewTab").addEventListener("click", () => showPane("review"));
  $("refreshBtn").addEventListener("click", () => loadPage());
  $("refreshReviewBtn").addEventListener("click", () => loadReviewQueue());
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("logoutBtn").addEventListener("click", async () => {
    await request("/api/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
    localStorage.removeItem("chat_username");
    localStorage.removeItem("chat_role");
    location.href = "/login.html";
  });
  if (socket) {
    socket.on("explore:posts-updated", () => loadPage({ queue: false }));
    socket.on("explore:review-count-updated", data => { if (state.canReview) $("pendingCount").textContent = String(data?.count || 0); });
    socket.on("explore:review-new", () => {
      toast("وصل طلب اكسبلور جديد للمراجعة");
      if (state.canReview && !$("reviewPane").hidden) loadReviewQueue();
    });
  }
  setInterval(() => loadPage({ queue: false }), 30000);
  loadPage().then(() => {
    if (new URLSearchParams(location.search).get("tab") === "review") showPane("review");
  });
})();
