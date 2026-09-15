(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const page = (window.location.pathname || "/").slice(0, 120);
  const roomId = String(params.get("roomId") || params.get("room") || "").slice(0, 120);
  let stopped = false;

  function post(path, body, keepalive) {
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      keepalive: Boolean(keepalive),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).catch(() => null);
  }

  function heartbeat(activity = "") {
    if (stopped) return;
    post("/api/analytics/heartbeat", {
      page,
      roomId,
      visible: document.visibilityState === "visible",
      activity: String(activity || "").slice(0, 40)
    });
  }

  function track(type, data = {}) {
    const allowed = new Set(["page_performance", "feature_use"]);
    if (!allowed.has(type)) return Promise.resolve(null);
    return post("/api/analytics/event", {
      type,
      page,
      ...data
    });
  }

  window.TomiAnalytics = Object.freeze({ heartbeat, track });

  function collectPerformance() {
    try {
      const navigation = performance.getEntriesByType?.("navigation")?.[0];
      if (!navigation) return;
      const loadMs = Math.max(0, Math.round(navigation.loadEventEnd || navigation.domComplete || 0));
      if (!loadMs) return;
      track("page_performance", {
        loadMs,
        metadata: {
          ttfbMs: Math.max(0, Math.round(navigation.responseStart || 0)),
          domContentLoadedMs: Math.max(0, Math.round(navigation.domContentLoadedEventEnd || 0)),
          transferSize: Math.max(0, Math.round(navigation.transferSize || 0))
        }
      });
    } catch (_) {}
  }

  function start() {
    heartbeat("page-open");
    window.setInterval(() => heartbeat("interval"), 45 * 1000);
    window.addEventListener("focus", () => heartbeat("focus"), { passive: true });
    document.addEventListener("visibilitychange", () => heartbeat(document.visibilityState), { passive: true });
    window.addEventListener("beforeunload", () => {
      stopped = true;
      post("/api/analytics/heartbeat", {
        page,
        roomId,
        visible: false,
        activity: "page-close"
      }, true);
    });
    window.setTimeout(collectPerformance, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
