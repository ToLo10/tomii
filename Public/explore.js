(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const socket = typeof io === "function" ? io({ autoConnect: false }) : null;
  const state = { username: "", isOwner: false, canReview: false, canDelete: false, type: "note", feed: [], queue: [], loading: false };

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

  function makeComment(comment = {}) {
    const row = document.createElement("div");
    row.className = "comment-row";
    const avatar = document.createElement("img");
    avatar.className = "comment-avatar";
    avatar.alt = "";
    avatar.src = comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.displayName || comment.username || "T")}&background=30294a&color=fff`;
    avatar.onerror = () => { avatar.onerror = null; avatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2330294a'/%3E%3Ctext x='50%25' y='58%25' text-anchor='middle' font-size='15' fill='%23d8caff'%3ET%3C/text%3E%3C/svg%3E"; };
    const copy = document.createElement("div");
    copy.className = "comment-copy";
    const head = document.createElement("div");
    head.className = "comment-head";
    const name = document.createElement("strong");
    name.textContent = comment.displayName || comment.username || "مستخدم TOMI";
    const time = document.createElement("small");
    time.textContent = dateLabel(comment.createdAt);
    head.append(name, time);
    const text = document.createElement("p");
    text.textContent = comment.text || "";
    copy.append(head, text);
    row.append(avatar, copy);
    return row;
  }

  async function togglePostLike(post, button) {
    if (!post || !button) return;
    button.disabled = true;
    try {
      const data = await request(`/api/explore/posts/${encodeURIComponent(post.id)}/like`, { method: "POST", body: "{}" });
      post.likedByMe = Boolean(data.liked);
      post.likeCount = Number(data.likeCount || 0);
      const icon = button.querySelector("i");
      if (icon) icon.className = post.likedByMe ? "fa-solid fa-heart" : "fa-regular fa-heart";
      button.classList.toggle("active", post.likedByMe);
      const count = button.querySelector("b");
      if (count) count.textContent = String(post.likeCount);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function deletePost(post, button) {
    if (!post || !state.canDelete || !confirm("حذف هذا المنشور من اكسبلور؟")) return;
    button.disabled = true;
    try {
      const data = await request(`/api/explore/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
      toast(data.message || "تم حذف المنشور");
      await loadPage({ queue: false });
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  }

  async function addPostComment(post, input, button) {
    const text = String(input?.value || "").trim();
    if (!text) return toast("اكتب تعليقًا أولاً", true);
    button.disabled = true;
    try {
      const data = await request(`/api/explore/posts/${encodeURIComponent(post.id)}/comments`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      post.comments = [...(Array.isArray(post.comments) ? post.comments : []), data.comment].slice(-200);
      input.value = "";
      renderFeed();
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function emptyBox(message) {
    const box = document.createElement("div");
    box.className = "empty-box";
    box.textContent = message;
    return box;
  }

  // Media URLs can be short-lived redirects (for example, a signed R2 URL).
  // Keep the post URL as the source of truth and request a fresh URL when a
  // browser reports an expired/stalled stream. This prevents a video that
  // worked immediately after publishing from becoming a permanent 0:00
  // placeholder after the signed URL or a temporary network connection ends.
  function makeVideoElement(post) {
    const shell = document.createElement("div");
    shell.className = "post-video-shell";
    const video = document.createElement("video");
    video.className = "post-video";
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("playsinline", "");

    const errorBox = document.createElement("div");
    errorBox.className = "post-video-error";
    errorBox.hidden = true;
    const errorText = document.createElement("span");
    errorText.textContent = "تعذر تحميل الفيديو حالياً";
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.textContent = "إعادة المحاولة";
    errorBox.append(errorText, retryButton);

    const sourceUrl = String(post.fileUrl || "");
    let recoveryCount = 0;
    let recoveryTimer = null;
    let recovering = false;
    let shouldResume = false;

    function freshUrl() {
      try {
        const url = new URL(sourceUrl, window.location.origin);
        url.searchParams.set("retry", `${Date.now()}-${recoveryCount}`);
        return `${url.pathname}${url.search}${url.hash}`;
      } catch (_) {
        return sourceUrl;
      }
    }

    function showVideoError() {
      errorBox.hidden = false;
      video.classList.add("has-error");
    }

    function recoverVideo({ manual = false } = {}) {
      if (!sourceUrl || recovering) return;
      if (!manual && recoveryCount >= 3) {
        showVideoError();
        return;
      }
      if (manual) recoveryCount = 0;
      recoveryCount += 1;
      recovering = true;
      errorBox.hidden = true;
      video.classList.remove("has-error");
      const resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const wasPlaying = shouldResume && !video.ended;
      video.pause();
      video.src = freshUrl();
      video.load();
      video.addEventListener("loadedmetadata", () => {
        recovering = false;
        if (resumeAt > 0 && Number.isFinite(video.duration) && video.duration > resumeAt) {
          try { video.currentTime = resumeAt; } catch (_) {}
        }
        if (wasPlaying) video.play().catch(() => {});
      }, { once: true });
      // If the server returns a persistent error, release the lock so the
      // visible retry button can request another fresh URL.
      setTimeout(() => { recovering = false; }, 8000);
    }

    function scheduleRecovery(delay = 350) {
      if (recoveryTimer || recoveryCount >= 3) return;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        recoverVideo();
      }, delay);
    }

    video.addEventListener("error", () => {
      if (recoveryCount < 3) scheduleRecovery(350);
      else showVideoError();
    });
    video.addEventListener("play", () => { shouldResume = true; });
    video.addEventListener("pause", () => {
      // A media error can implicitly pause the element. Keep the prior play
      // intent so a refreshed signed URL can continue from the same position.
      if (!video.error) shouldResume = false;
    });
    video.addEventListener("ended", () => { shouldResume = false; });
    video.addEventListener("stalled", () => {
      // During preload the element is technically paused, so also recover a
      // stream that never managed to receive metadata (readyState === 0).
      if (video.readyState < 1 || (!video.paused && video.readyState < 3)) {
        scheduleRecovery(2500);
      }
    });
    video.addEventListener("waiting", () => {
      if (!video.paused && video.readyState < 3) scheduleRecovery(2500);
    });
    retryButton.addEventListener("click", () => recoverVideo({ manual: true }));
    video.src = sourceUrl;
    shell.append(video, errorBox);
    return shell;
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
        card.appendChild(makeVideoElement(post));
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
      const social = document.createElement("div");
      social.className = "post-social";
      const socialActions = document.createElement("div");
      socialActions.className = "post-social-actions";
      const likeButton = document.createElement("button");
      likeButton.type = "button";
      likeButton.className = `like-btn${post.likedByMe ? " active" : ""}`;
      likeButton.innerHTML = `<i class="${post.likedByMe ? "fa-solid" : "fa-regular"} fa-heart" aria-hidden="true"></i><span>إعجاب</span> <b>${Number(post.likeCount || 0)}</b>`;
      likeButton.addEventListener("click", () => togglePostLike(post, likeButton));
      socialActions.appendChild(likeButton);
      if (state.canDelete) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "post-delete-btn";
        deleteButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i> حذف';
        deleteButton.addEventListener("click", () => deletePost(post, deleteButton));
        socialActions.appendChild(deleteButton);
      }
      social.appendChild(socialActions);
      const comments = document.createElement("div");
      comments.className = "comment-list";
      (Array.isArray(post.comments) ? post.comments : []).slice(-20).forEach(comment => comments.appendChild(makeComment(comment)));
      if (comments.childElementCount) social.appendChild(comments);
      const commentForm = document.createElement("form");
      commentForm.className = "comment-form";
      const commentInput = document.createElement("input");
      commentInput.type = "text";
      commentInput.maxLength = 500;
      commentInput.placeholder = "اكتب تعليقًا...";
      commentInput.setAttribute("aria-label", "تعليق على المنشور");
      const commentButton = document.createElement("button");
      commentButton.type = "submit";
      commentButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
      commentButton.setAttribute("aria-label", "إرسال التعليق");
      commentForm.append(commentInput, commentButton);
      commentForm.addEventListener("submit", event => { event.preventDefault(); void addPostComment(post, commentInput, commentButton); });
      social.appendChild(commentForm);
      card.appendChild(social);
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
        card.appendChild(makeVideoElement(post));
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
      state.canDelete = Boolean(data.canDelete || data.isOwner);
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

  async function isSupportedExploreVideo(file) {
    const mime = String(file?.type || "").toLowerCase().split(";", 1)[0].trim();
    const name = String(file?.name || "").toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const videoExtensions = new Set([
      ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".3gp", ".3g2",
      ".mpeg", ".mpg", ".mts", ".m2ts", ".ogv", ".flv", ".wmv"
    ]);
    const audioExtensions = new Set([".m4a", ".mp3", ".aac", ".wav", ".ogg", ".opus", ".flac", ".weba"]);
    const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif"]);

    if (mime.startsWith("image/") || mime === "application/pdf" || imageExtensions.has(ext)) return false;
    if (/^voice[-_]/i.test(name) || (audioExtensions.has(ext) && !videoExtensions.has(ext))) return false;
    if (mime.startsWith("video/") || videoExtensions.has(ext)) return true;
    // iOS and some Android gallery providers report MP4/MOV videos as audio.
    if (["audio/mp4", "audio/quicktime"].includes(mime)
      && !audioExtensions.has(ext) && !/^voice[-_]/i.test(name)) return true;
    // A mobile gallery may return an empty or generic MIME and no filename.
    // Inspect a short signature rather than guessing from the picker alone.
    if (!mime || ["application/octet-stream", "binary/octet-stream"].includes(mime)) {
      try {
        const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
        const startsWith = (...signature) => signature.every((value, index) => bytes[index] === value);
        const asciiAt = (offset, length) => {
          if (bytes.length < offset + length) return "";
          return String.fromCharCode(...bytes.slice(offset, offset + length));
        };
        if (startsWith(0x89, 0x50, 0x4e, 0x47) || startsWith(0xff, 0xd8, 0xff)
          || asciiAt(0, 4) === "GIF8" || (asciiAt(0, 4) === "RIFF" && asciiAt(8, 4) === "WEBP")) return false;
        if (asciiAt(4, 4) === "ftyp") {
          const brand = asciiAt(8, 4).toLowerCase();
          if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif"].includes(brand)) return false;
          return ["isom", "iso2", "mp41", "mp42", "avc1", "hvc1", "hev1", "m4v ", "qt  ", "3gp4", "3gp5"].includes(brand);
        }
        if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return true;
        if (asciiAt(0, 4) === "RIFF" && asciiAt(8, 4) === "AVI ") return true;
      } catch (_) {}
    }
    return false;
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
        if (!await isSupportedExploreVideo(file)) throw new Error("اختر ملف فيديو بصيغة مدعومة");
        if (!file.size) throw new Error("ملف الفيديو فارغ");
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
  $("videoFile").addEventListener("change", async () => {
    const file = $("videoFile").files?.[0];
    const supported = file ? await isSupportedExploreVideo(file) : false;
    $("videoName").textContent = file
      ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(1)} MB${supported ? "" : " • تحقق من اختيار فيديو"}`
      : "MP4 أو صيغة فيديو مدعومة • الحد 150 ميغابايت";
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
