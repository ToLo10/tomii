(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let session = null;
  let safetySocket = null;
  let safetyPoll = null;
  let firstSafetyPoll = true;
  const seenSafetyAlerts = new Set();

  function escapeText(value) {
    return String(value ?? "");
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذر تنفيذ الطلب");
    return data;
  }

  function showToast(message, warning = false) {
    const existing = document.querySelector(".tomi-ai-toast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.className = `tomi-ai-toast${warning ? " warning" : ""}`;
    toast.textContent = escapeText(message);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 6500);
  }

  function createWidget() {
    if ($("tomiAiWidget")) return;
    const root = document.createElement("div");
    root.id = "tomiAiWidget";
    root.innerHTML = `
      <button id="tomiAiLauncher" type="button" aria-label="فتح مساعد TOMI" aria-expanded="false" title="اسأل مساعد TOMI">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span class="tomi-ai-launcher-label">اسأل مساعد TOMI</span>
      </button>
      <aside id="tomiAiPanel" hidden aria-label="مساعد TOMI">
        <div class="tomi-ai-header">
          <div class="tomi-ai-brand"><i class="fa-solid fa-sparkles"></i></div>
          <div class="tomi-ai-heading"><strong>مساعد TOMI</strong><small>مساعدة، بحث واقتراحات بخصوصية</small></div>
          <button id="tomiAiClose" class="tomi-ai-close" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="tomi-ai-tabs" role="tablist">
          <button class="tomi-ai-tab active" type="button" data-ai-tab="ask">اسأل TOMI</button>
          <button class="tomi-ai-tab" type="button" data-ai-tab="search">بحث محادثاتي</button>
          <button class="tomi-ai-tab" type="button" data-ai-tab="recommendations">اقتراحات</button>
        </div>
        <div class="tomi-ai-body">
          <section id="tomiAiAskPane" class="tomi-ai-pane">
            <p class="tomi-ai-intro">أشرح لك طريقة استخدام الموقع وأجاوب على الأسئلة المتكررة بالعربي العراقي.</p>
            <div class="tomi-ai-quick-list">
              <button class="tomi-ai-quick" type="button" data-ai-prompt="شلون أنشئ غرفة عامة؟">إنشاء غرفة</button>
              <button class="tomi-ai-quick" type="button" data-ai-prompt="شلون أدعو صديقي؟">دعوة صديق</button>
              <button class="tomi-ai-quick" type="button" data-ai-prompt="شلون أوقف الإشعارات؟">الإشعارات</button>
              <button class="tomi-ai-quick" type="button" data-ai-prompt="شلون أرفع فيديو؟">رفع فيديو</button>
            </div>
            <form id="tomiAiAskForm" class="tomi-ai-form">
              <input id="tomiAiAskInput" class="tomi-ai-input" type="text" maxlength="800" autocomplete="off" placeholder="اكتب سؤالك هنا...">
              <button class="tomi-ai-submit" type="submit">اسأل</button>
            </form>
            <div id="tomiAiAnswer" class="tomi-ai-answer muted">اختَر سؤالاً أو اكتب استفسارك حتى أساعدك.</div>
            <p class="tomi-ai-note">المساعد لا يطلب كلمة المرور ولا يطلع على محادثاتك الخاصة ضمن المساعدة العامة.</p>
          </section>

          <section id="tomiAiSearchPane" class="tomi-ai-pane" hidden>
            <p class="tomi-ai-intro">ابحث داخل المحادثات التي تملك صلاحية الوصول إليها فقط.</p>
            <form id="tomiAiSearchForm" class="tomi-ai-form">
              <input id="tomiAiSearchInput" class="tomi-ai-input" type="search" maxlength="240" autocomplete="off" placeholder="مثلاً: الفيديو أو موعد الاتصال...">
              <button class="tomi-ai-submit" type="submit">بحث</button>
            </form>
            <div id="tomiAiSearchResults" class="tomi-ai-list"><div class="tomi-ai-empty">اكتب كلمة حتى أبحث في رسائلك.</div></div>
            <p class="tomi-ai-note">نتائج البحث خاصة بحسابك، ولا يتم البحث في محادثات المستخدمين الآخرين.</p>
          </section>

          <section id="tomiAiRecommendationsPane" class="tomi-ai-pane" hidden>
            <p class="tomi-ai-intro">حدد اهتماماتك حتى أقترح غرفاً عامة وأصدقاءً مناسبين.</p>
            <div class="tomi-ai-interest-box">
              <input id="tomiAiInterestsInput" class="tomi-ai-input" type="text" maxlength="260" placeholder="مثلاً: شبكات، ألعاب، أفلام">
              <button id="tomiAiSaveInterests" class="tomi-ai-save" type="button">حفظ</button>
            </div>
            <div id="tomiAiRecommendations" class="tomi-ai-list"><div class="tomi-ai-empty">جاري تحميل الاقتراحات...</div></div>
          </section>
        </div>
      </aside>`;
    document.body.appendChild(root);
  }

  function togglePanel(force) {
    const panel = $("tomiAiPanel");
    const launcher = $("tomiAiLauncher");
    if (!panel || !launcher) return;
    const open = typeof force === "boolean" ? force : panel.hidden;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.classList.toggle("is-open", open);
    if (open) $("tomiAiAskInput")?.focus({ preventScroll: true });
  }

  function setTab(tab) {
    const names = ["ask", "search", "recommendations"];
    for (const name of names) {
      $(`tomiAi${name[0].toUpperCase()}${name.slice(1)}Pane`)?.toggleAttribute("hidden", name !== tab);
    }
    document.querySelectorAll("[data-ai-tab]").forEach(button => button.classList.toggle("active", button.dataset.aiTab === tab));
    if (tab === "recommendations") loadRecommendations();
  }

  function setAnswer(text, type = "normal") {
    const box = $("tomiAiAnswer");
    if (!box) return;
    box.className = `tomi-ai-answer${type === "muted" ? " muted" : type === "error" ? " error" : ""}`;
    box.textContent = escapeText(text);
  }

  async function ask(question) {
    const clean = String(question || "").trim();
    if (!clean) return;
    const button = document.querySelector("#tomiAiAskForm .tomi-ai-submit");
    const input = $("tomiAiAskInput");
    if (input) input.value = clean;
    if (button) button.disabled = true;
    setAnswer("جاري التفكير...", "muted");
    try {
      const data = await request("/api/ai/ask", { method: "POST", body: JSON.stringify({ question: clean }) });
      setAnswer(data.answer || "ما حصلت جواباً حالياً.");
    } catch (error) {
      setAnswer(error.message || "تعذر تشغيل المساعد", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderSearchResults(data) {
    const host = $("tomiAiSearchResults");
    if (!host) return;
    host.innerHTML = "";
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) {
      host.innerHTML = '<div class="tomi-ai-empty">ما لكيت رسائل مطابقة ضمن محادثاتك.</div>';
      return;
    }
    results.forEach(item => {
      const link = document.createElement("a");
      link.className = "tomi-ai-result";
      link.href = `/room.html?roomId=${encodeURIComponent(item.roomId || "")}`;
      const head = document.createElement("div");
      head.className = "tomi-ai-result-head";
      const title = document.createElement("strong");
      title.textContent = item.roomName || "محادثة";
      const badge = document.createElement("span");
      badge.className = "tomi-ai-badge";
      badge.textContent = item.sender || "";
      head.append(title, badge);
      const preview = document.createElement("small");
      preview.textContent = item.preview || "";
      link.append(head, preview);
      host.appendChild(link);
    });
  }

  async function searchMessages(query) {
    const clean = String(query || "").trim();
    if (!clean) return;
    const host = $("tomiAiSearchResults");
    if (host) host.innerHTML = '<div class="tomi-ai-empty">جاري البحث...</div>';
    try {
      const data = await request("/api/ai/search", { method: "POST", body: JSON.stringify({ query: clean }) });
      renderSearchResults(data);
    } catch (error) {
      if (host) host.innerHTML = `<div class="tomi-ai-empty">${escapeText(error.message || "تعذر البحث")}</div>`;
    }
  }

  function appendRecommendation(host, item, type) {
    const link = document.createElement("a");
    link.className = "tomi-ai-recommendation";
    if (type === "room") link.href = `/room.html?roomId=${encodeURIComponent(item.roomId || "")}`;
    else link.href = `/index.html?section=search&query=${encodeURIComponent(item.username || "")}`;
    const head = document.createElement("div");
    head.className = "tomi-ai-recommendation-head";
    const title = document.createElement("strong");
    title.textContent = type === "room" ? (item.name || "غرفة عامة") : (item.displayName || item.username || "صديق");
    const badge = document.createElement("span");
    badge.className = "tomi-ai-badge";
    badge.textContent = type === "room" ? `${Number(item.memberCount || 0).toLocaleString("ar-IQ")} أعضاء` : (item.isOnline ? "متصل" : "مقترح");
    head.append(title, badge);
    const reason = document.createElement("small");
    reason.textContent = item.reason || "اقتراح مناسب لك";
    link.append(head, reason);
    host.appendChild(link);
  }

  async function loadRecommendations() {
    const host = $("tomiAiRecommendations");
    if (!host) return;
    host.innerHTML = '<div class="tomi-ai-empty">جاري تجهيز الاقتراحات...</div>';
    try {
      const [data, prefs] = await Promise.all([
        request("/api/ai/recommendations"),
        request("/api/ai/preferences")
      ]);
      const interests = Array.isArray(prefs?.preferences?.interests) ? prefs.preferences.interests : [];
      const input = $("tomiAiInterestsInput");
      if (input && document.activeElement !== input) input.value = interests.join("، ");
      host.innerHTML = "";
      if (data?.needsInterests) {
        const hint = document.createElement("div");
        hint.className = "tomi-ai-empty";
        hint.textContent = "اكتب اهتماماتك بالأعلى حتى تصير الاقتراحات أدق. حالياً راح أعرض الغرف النشطة.";
        host.appendChild(hint);
      }
      const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
      const friends = Array.isArray(data?.friends) ? data.friends : [];
      if (rooms.length) {
        const label = document.createElement("div");
        label.className = "tomi-ai-section-label";
        label.textContent = "غرف مقترحة";
        host.appendChild(label);
        rooms.forEach(item => appendRecommendation(host, item, "room"));
      }
      if (friends.length) {
        const label = document.createElement("div");
        label.className = "tomi-ai-section-label";
        label.textContent = "أصدقاء مقترحون";
        host.appendChild(label);
        friends.forEach(item => appendRecommendation(host, item, "friend"));
      }
      if (!rooms.length && !friends.length) {
        const empty = document.createElement("div");
        empty.className = "tomi-ai-empty";
        empty.textContent = "لا توجد اقتراحات كافية حالياً. جرّب إضافة اهتمامات أو الانضمام إلى غرفة عامة.";
        host.appendChild(empty);
      }
    } catch (error) {
      host.innerHTML = `<div class="tomi-ai-empty">${escapeText(error.message || "تعذر تحميل الاقتراحات")}</div>`;
    }
  }

  async function saveInterests() {
    const input = $("tomiAiInterestsInput");
    const button = $("tomiAiSaveInterests");
    if (!input) return;
    if (button) button.disabled = true;
    try {
      await request("/api/ai/preferences", {
        method: "POST",
        body: JSON.stringify({ interests: input.value })
      });
      showToast("تم حفظ اهتماماتك وتحديث الاقتراحات");
      await loadRecommendations();
    } catch (error) {
      showToast(error.message || "تعذر حفظ الاهتمامات", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function notifySafetyAlert(alert) {
    if (!alert?.alertId || seenSafetyAlerts.has(alert.alertId)) return;
    seenSafetyAlerts.add(alert.alertId);
    showToast(`تنبيه أمان: ${alert.senderDisplayName || alert.sender || "مستخدم"} — ${(alert.categories || []).join("، ") || "مراجعة مطلوبة"}`, true);
  }

  async function pollSafetyAlerts() {
    try {
      const data = await request("/api/admin/ai/alerts?status=pending&limit=5");
      const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
      if (firstSafetyPoll) {
        alerts.forEach(alert => seenSafetyAlerts.add(alert.alertId));
        firstSafetyPoll = false;
      } else {
        alerts.forEach(notifySafetyAlert);
      }
    } catch (_) {}
  }

  function startSafetyNotifications() {
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const isStaff = session?.role === "owner" || session?.username === "tomi" || permissions.includes("manage_ai_safety");
    if (!isStaff) return;
    pollSafetyAlerts();
    safetyPoll = window.setInterval(pollSafetyAlerts, 45 * 1000);
    if (typeof window.io === "function") {
      try {
        safetySocket = window.io({ autoConnect: true, reconnection: true, reconnectionAttempts: Infinity });
        safetySocket.on("ai-moderation-alert", notifySafetyAlert);
      } catch (_) {}
    }
  }

  function bind() {
    $("tomiAiLauncher")?.addEventListener("click", () => togglePanel());
    $("tomiAiClose")?.addEventListener("click", () => togglePanel(false));
    document.querySelectorAll("[data-ai-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.aiTab)));
    document.querySelectorAll("[data-ai-prompt]").forEach(button => button.addEventListener("click", () => ask(button.dataset.aiPrompt)));
    $("tomiAiAskForm")?.addEventListener("submit", event => { event.preventDefault(); ask($("tomiAiAskInput")?.value); });
    $("tomiAiSearchForm")?.addEventListener("submit", event => { event.preventDefault(); searchMessages($("tomiAiSearchInput")?.value); });
    $("tomiAiSaveInterests")?.addEventListener("click", saveInterests);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && $("tomiAiPanel") && !$("tomiAiPanel").hidden) togglePanel(false); });
  }

  async function boot() {
    if (location.pathname.endsWith("login.html")) return;
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      session = await response.json();
      createWidget();
      bind();
      startSafetyNotifications();
    } catch (_) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  window.addEventListener("beforeunload", () => {
    if (safetyPoll) window.clearInterval(safetyPoll);
    try { safetySocket?.disconnect(); } catch (_) {}
  });
})();
