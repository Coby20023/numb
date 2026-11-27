/* Records one anonymous page view per page per browser session.
   Stores country and city only. The IP address is never saved. */
(function () {
  "use strict";

  var client = window.moyendaSupabase;
  if (!client || /admin(\.html)?$/i.test(location.pathname) || navigator.doNotTrack === "1") return;

  function area(name) { try { return window[name]; } catch (e) { return null; } }
  var local = area("localStorage");
  var session = area("sessionStorage");

  var file = (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "").toLowerCase();
  var page = (file || "index").slice(0, 100);

  try {
    if (session && session.getItem("mv:" + page)) return;
    if (session) session.setItem("mv:" + page, "1");
  } catch (e) {}

  function visitorId() {
    var id = null;
    try { id = local && local.getItem("moyenda_vid"); } catch (e) {}
    if (!id) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
      try { if (local) local.setItem("moyenda_vid", id); } catch (e) {}
    }
    return String(id).slice(0, 64);
  }

  function geo() {
    try {
      var cached = session && session.getItem("moyenda_geo");
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (e) {}
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 4000) : null;
    return fetch("https://ipwho.is/", controller ? { signal: controller.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var g = j && j.success ? {
          country: String(j.country || "").slice(0, 80) || null,
          city: String(j.city || "").slice(0, 80) || null
        } : {};
        try { if (session) session.setItem("moyenda_geo", JSON.stringify(g)); } catch (e) {}
        return g;
      })
      .catch(function () { return {}; })
      .then(function (g) { if (timer) clearTimeout(timer); return g; });
  }

  var ua = navigator.userAgent || "";
  var device = /iPad|Tablet|Android(?!.*Mobi)/i.test(ua) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop";

  var referrer = null;
  try {
    var host = new URL(document.referrer).hostname;
    if (host && host !== location.hostname) referrer = host.slice(0, 200);
  } catch (e) {}

  geo().then(function (g) {
    return client.from("page_views").insert({
      page: page,
      referrer: referrer,
      country: g.country || null,
      city: g.city || null,
      device: device,
      visitor_id: visitorId()
    });
  }).catch(function () {});
})();
