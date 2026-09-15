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
    try {
      const [overview, timeseries, system, referrals, users, ai] = await Promise.all([
        qs("/api/admin/analytics/overview", base),
        qs("/api/admin/analytics/timeseries", base),
        qs("/api/admin/analytics/system", base).catch(() => ({ points: [] })),
        qs("/api/admin/analytics/referrals").catch(() => ({ referrals: [] })),
        qs("/api/admin/analytics/users", { q: userQuery, limit: 100 }).catch(() => ({ users: [] })),
        qs("/api/admin/analytics/ai-summary", base).catch(() => ({}))
      ]);
      renderOverview(overview);
      renderBars("activityChart", timeseries.points, "activeUsers", { limit: period === "24h" ? 24 : 36 });
      renderBars("systemChart", system.points, "memory.rssMB", { limit: 36, system: true });
      renderAi(ai);
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
  load();
  refreshTimer = window.setInterval(load, 60 * 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(refreshTimer));
})();
