(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let period = "24h";
  let userQuery = "";
  let refreshTimer = null;

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  }[ch]));

  function range() {
    const duration = period === "30d" ? 30 : period === "7d" ? 7 : 1;
    const to = new Date();
    return { from: new Date(to.getTime() - duration * 24 * 60 * 60 * 1000).toISOString(), to: to.toISOString() };
  }

  function qs(path, params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null && value !== ""));
    return fetch(path + (query.toString() ? "?" + query.toString() : ""), { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "تعذر تحميل البيانات");
        return data;
      });
  }

  function number(value, digits = 0) {
    const n = Number(value || 0);
    return n.toLocaleString("ar-IQ", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function percent(value) { return `${Number(value || 0).toFixed(1)}%`; }

  function date(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" }) : "—";
  }

  function setMetric(id, value) { if ($(id)) $(id).textContent = value; }

  function renderOverview(data) {
    setMetric("visitorsMetric", number(data.visitors));
    setMetric("newUsersMetric", number(data.newUsers));
    setMetric("activeMetric", number(data.activeNow));
    setMetric("peakMetric", number(data.peakOnline));
    setMetric("latencyMetric", `${number(data.p95LatencyMs)}ms`);
    setMetric("errorsMetric", percent(data.errorRate));
    setMetric("uploadsMetric", data.uploadSuccessRate ? percent(data.uploadSuccessRate) : "—");
    setMetric("referralsMetric", number(data.referralClicks));
    setMetric("visitorsGrowth", `${Number(data.growth?.visitors || 0) >= 0 ? "↑" : "↓"} ${percent(Math.abs(data.growth?.visitors || 0))} مقارنة بالفترة السابقة`);
    setMetric("newUsersGrowth", `${Number(data.growth?.newUsers || 0) >= 0 ? "↑" : "↓"} ${percent(Math.abs(data.growth?.newUsers || 0))} مقارنة بالفترة السابقة`);
    setMetric("socketMetric", `${number(data.activeSockets)} اتصال Socket.IO`);
    setMetric("avgLatencyMetric", `المتوسط ${number(data.averageLatencyMs)}ms`);
    setMetric("errorsCountMetric", `${number(data.apiErrors)} من ${number(data.apiRequests)} طلب`);
    setMetric("uploadsCountMetric", `${number(data.uploadsCompleted)} مكتمل • ${number(data.uploadsFailed)} فاشل`);
    setMetric("referralsRegistrationsMetric", `${number(data.newUsers ? data.referralClicks : data.referralClicks)} زيارة إحالة`);
  }

  function renderBars(id, points, valueKey, options = {}) {
    const host = $(id);
    if (!host) return;
    const limit = Number(options.limit || 36);
    const list = Array.isArray(points) ? points.slice(-limit) : [];
    if (!list.length) {
      host.className = "bar-chart empty-chart";
      host.innerHTML = "<span>لا توجد بيانات بعد</span>";
      return;
    }
    host.className = "bar-chart";
    const values = list.map(item => valueKey.split(".").reduce((value, key) => value?.[key], item) || 0).map(value => Number(value || 0));
    const max = Math.max(1, ...values);
    host.innerHTML = list.map((item, index) => {
      const value = values[index];
      const height = Math.max(value ? 4 : 1, Math.round((value / max) * 100));
      const labelDate = new Date(item.bucketStart || item.at);
      const label = Number.isFinite(labelDate.getTime())
        ? item.bucketType === "day"
          ? labelDate.toLocaleDateString("ar-IQ", { day: "numeric", month: "numeric" })
          : labelDate.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
        : "";
      return `<div class="bar-column ${options.system ? "system" : ""}" title="${esc(number(value, options.digits || 0))}"><span class="bar-value">${esc(number(value, options.digits || 0))}</span><div class="bar-fill" style="height:${height}%"></div><span class="bar-label">${esc(label)}</span></div>`;
    }).join("");
  }

  function renderAi(data) {
    const summary = data?.summary || "لا توجد بيانات كافية بعد للتحليل.";
    $("aiSummary").textContent = summary;
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    $("aiAlerts").innerHTML = alerts.map((item, index) => `<span class="ai-alert ${alerts.length === 1 && index === 0 && /لا توجد/.test(item) ? "ok" : ""}"><i class="fa-solid ${index === 0 && alerts.length > 1 ? "fa-triangle-exclamation" : "fa-circle-info"}"></i> ${esc(item)}</span>`).join("");
  }

  function renderAiSafety(data) {
    const host = $("aiSafetyAlerts");
    if (!host) return;
    if (data?.accessError) {
      host.innerHTML = `<div class="table-empty">${esc(data.accessError)}</div>`;
      return;
    }
    const rows = Array.isArray(data?.alerts) ? data.alerts : [];
    if (!rows.length) {
      host.innerHTML = '<div class="table-empty">لا توجد تنبيهات أمان بالحالة المحددة.</div>';
      return;
    }
    const statusLabels = { pending: "قيد الانتظار", reviewing: "قيد المراجعة", actioned: "تم اتخاذ إجراء", dismissed: "مرفوض" };
    host.innerHTML = rows.map(row => {
      const status = Object.prototype.hasOwnProperty.call(statusLabels, row.status) ? row.status : "pending";
      const tags = Array.isArray(row.categories) && row.categories.length
        ? row.categories.map(item => `<span class="ai-safety-tag">${esc(item)}</span>`).join("")
        : '<span class="ai-safety-tag">مراجعة</span>';
      const score = Math.round(Math.max(0, Math.min(1, Number(row.score || 0))) * 100);
      return `<article class="ai-safety-card status-${status}" data-alert-id="${esc(row.alertId)}">
        <div class="ai-safety-card-head"><div><strong>${esc(row.senderDisplayName || row.sender || "مستخدم")}</strong><small>${esc(row.roomName || row.roomId || "محادثة")} • ${esc(date(row.createdAt))}</small></div><span class="ai-safety-score">ثقة ${score}%</span></div>
        <div class="ai-safety-tags">${tags}</div>
        <p>${esc(row.preview || "لا يوجد نص معاينة")}</p>
        <div class="ai-safety-card-meta"><span>${esc((Array.isArray(row.reasons) ? row.reasons : []).join("، ") || "تحتاج مراجعة بشرية")}</span><span>الحالة: ${esc(statusLabels[status])}</span></div>
        <div class="ai-safety-actions">
          <select data-ai-alert-status aria-label="حالة التنبيه">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}"${value === status ? " selected" : ""}>${label}</option>`).join("")}
          </select>
          <input data-ai-alert-resolution maxlength="1000" value="${esc(row.resolution || "")}" placeholder="ملاحظة المشرف..." aria-label="ملاحظة المشرف">
          <button type="button" data-ai-alert-review>حفظ المراجعة</button>
        </div>
      </article>`;
    }).join("");
  }

  async function askAnalyticsQuestion(question) {
    const clean = String(question || "").trim();
    const input = $("analyticsAiQuestion");
    const answer = $("analyticsAiAnswer");
    const button = $("askAnalyticsAiBtn");
    if (!clean || !answer) return;
    if (input) input.value = clean;
    if (button) button.disabled = true;
    answer.className = "ai-question-answer loading";
    answer.textContent = "جاري قراءة المؤشرات...";
    try {
      const query = new URLSearchParams(range()).toString();
      const response = await fetch(`/api/admin/analytics/ask?${query}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر تحليل السؤال");
      answer.className = "ai-question-answer";
      answer.textContent = data.answer || "لا توجد إجابة كافية لهذه الفترة.";
    } catch (error) {
      answer.className = "ai-question-answer error";
      answer.textContent = error.message || "تعذر تحليل السؤال حالياً";
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderReferrals(data) {
    const rows = Array.isArray(data?.referrals) ? data.referrals : [];
    $("referralsTable").innerHTML = rows.length ? rows.map(row => `<tr><td><div class="user-name"><strong>${esc(row.ownerUserId || "—")}</strong><small>${esc(row.lastClickAt ? date(row.lastClickAt) : "لا توجد زيارة أخيرة")}</small></div></td><td><span class="role-tag">${esc(row.code)}</span></td><td>${number(row.clicks)}</td><td>${number(row.uniqueClicks)}</td><td>${number(row.registrations)}</td><td>${percent(row.conversionRate)}</td></tr>`).join("") : '<tr><td colspan="6" class="table-empty">لا توجد إحالات بعد</td></tr>';
  }

  function renderUsers(data) {
    const rows = Array.isArray(data?.users) ? data.users : [];
    $("usersTable").innerHTML = rows.length ? rows.map(row => {
      const stats = row.stats || {};
      const online = row.status === "online";
      return `<tr><td><div class="user-name"><strong>${esc(row.displayName || row.username)}</strong><small>@${esc(row.username)}${row.role && row.role !== "user" ? ` • ${esc(row.role)}` : ""}</small></div></td><td><span class="${online ? "online-dot" : "offline-dot"}"><i class="fa-solid fa-circle"></i> ${online ? "متصل" : "غير متصل"}</span></td><td>${esc(date(row.registeredAt))}</td><td>${esc(date(row.lastSeen))}</td><td>${number(stats.sessions)}</td><td>${number(stats.messagesSent)}</td><td>${number(stats.uploadsCompleted)} / ${number(stats.uploadBytes / 1024 / 1024, 1)}MB</td></tr>`;
    }).join("") : '<tr><td colspan="7" class="table-empty">لا توجد بيانات مستخدمين</td></tr>';
  }

  async function load() {
    const state = $("connectionState");
    state.classList.remove("error");
    state.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحديث';
    $("pageError").hidden = true;
    const r = range();
    const base = { from: r.from, to: r.to };
    const alertStatus = $("aiAlertsStatus")?.value || "pending";
    try {
      const [overview, timeseries, system, referrals, users, ai, safety] = await Promise.all([
        qs("/api/admin/analytics/overview", base),
        qs("/api/admin/analytics/timeseries", base),
        qs("/api/admin/analytics/system", base).catch(() => ({ points: [] })),
        qs("/api/admin/analytics/referrals").catch(() => ({ referrals: [] })),
        qs("/api/admin/analytics/users", { q: userQuery, limit: 100 }).catch(() => ({ users: [] })),
        qs("/api/admin/analytics/ai-summary", base).catch(() => ({})),
        qs("/api/admin/ai/alerts", { status: alertStatus, limit: 100 }).catch(error => ({ alerts: [], accessError: error.message }))
      ]);
      renderOverview(overview);
      renderBars("activityChart", timeseries.points, "activeUsers", { limit: period === "24h" ? 24 : 36 });
      renderBars("systemChart", system.points, "memory.rssMB", { limit: 36, system: true });
      renderAi(ai);
      renderAiSafety(safety);
      renderReferrals(referrals);
      renderUsers(users);
      $("lastUpdated").textContent = new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
      state.classList.remove("error");
      state.innerHTML = '<i class="fa-solid fa-circle"></i> متصل';
    } catch (error) {
      state.classList.add("error");
      state.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> تعذر الاتصال';
      $("pageError").hidden = false;
      $("pageError").textContent = error.message || "تعذر تحميل التحليلات";
      if (/401|تسجيل الدخول/.test(error.message || "")) window.location.href = "login.html";
    }
  }

  document.querySelectorAll(".period-btn").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".period-btn").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    period = button.dataset.period || "24h";
    load();
  }));
  $("refreshBtn")?.addEventListener("click", load);
  $("userSearchBtn")?.addEventListener("click", () => { userQuery = $("userSearch").value.trim(); load(); });
  $("userSearch")?.addEventListener("keydown", event => { if (event.key === "Enter") { userQuery = event.target.value.trim(); load(); } });
  $("askAnalyticsAiBtn")?.addEventListener("click", () => askAnalyticsQuestion($("analyticsAiQuestion")?.value));
  $("analyticsAiQuestion")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); askAnalyticsQuestion(event.target.value); } });
  document.querySelectorAll("[data-analytics-question]").forEach(button => button.addEventListener("click", () => askAnalyticsQuestion(button.dataset.analyticsQuestion)));
  $("refreshAiAlertsBtn")?.addEventListener("click", load);
  $("aiAlertsStatus")?.addEventListener("change", load);
  $("aiSafetyAlerts")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-ai-alert-review]");
    const card = button?.closest("[data-alert-id]");
    if (!button || !card) return;
    const alertId = card.dataset.alertId;
    const status = card.querySelector("[data-ai-alert-status]")?.value || "reviewing";
    const resolution = card.querySelector("[data-ai-alert-resolution]")?.value || "";
    button.disabled = true;
    try {
      const response = await fetch(`/api/admin/ai/alerts/${encodeURIComponent(alertId)}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, resolution })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المراجعة");
      await load();
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message || "تعذر الحفظ";
      window.setTimeout(() => { if (button.isConnected) button.textContent = "حفظ المراجعة"; }, 2200);
    }
  });
  load();
  refreshTimer = window.setInterval(load, 60 * 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(refreshTimer));
})();
