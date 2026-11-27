/* Instagram display. Reads posts cached in Supabase by the optional official Graph API sync.
   Nothing is fetched from Instagram in the browser, and fake posts are never shown. */
(function () {
  "use strict";

  var INSTAGRAM_URL = "https://www.instagram.com/moyendatourguide/";

  var css = [
    ".ig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}",
    ".ig-card{position:relative;display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;",
    "box-shadow:0 4px 14px rgba(14,27,44,.08);color:#0E1B2C;transition:transform .4s cubic-bezier(.2,.7,.2,1),box-shadow .4s}",
    ".ig-card:hover{transform:translateY(-6px);box-shadow:0 18px 40px rgba(14,27,44,.14)}",
    ".ig-thumb{position:relative;aspect-ratio:1/1;background:#E6F3FB;overflow:hidden}",
    ".ig-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}",
    ".ig-card:hover .ig-thumb img{transform:scale(1.05)}",
    ".ig-badge{position:absolute;top:12px;right:12px;background:rgba(14,27,44,.75);color:#fff;font:700 11px/1 system-ui,sans-serif;",
    "letter-spacing:.08em;text-transform:uppercase;padding:7px 10px;border-radius:999px}",
    ".ig-body{padding:18px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}",
    ".ig-date{font:600 12px system-ui,sans-serif;color:#1C6F9E;text-transform:uppercase;letter-spacing:.08em}",
    ".ig-caption{font:15px/1.5 system-ui,sans-serif;color:#55627A;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0}",
    ".ig-link{margin-top:auto;font:700 14px system-ui,sans-serif;color:#EB2F33;display:inline-flex;align-items:center;gap:6px}",
    ".ig-notice{background:#E6F3FB;color:#0E1B2C;border-radius:16px;padding:22px 24px;font:15px/1.6 system-ui,sans-serif;max-width:720px}",
    ".ig-notice strong{display:block;margin-bottom:6px;font-size:16px}",
    ".ig-more{display:flex;justify-content:center;margin-top:40px}",
    ".ig-more button{border:0;background:#0E1B2C;color:#fff;border-radius:999px;padding:15px 30px;font:700 15px system-ui,sans-serif;cursor:pointer}",
    ".ig-more button:disabled{opacity:.5;cursor:default}",
    ".ig-skeleton{background:linear-gradient(90deg,#E6F3FB 0%,#F8FAFC 50%,#E6F3FB 100%);background-size:200% 100%;",
    "animation:igshimmer 1.4s linear infinite;aspect-ratio:1/1;border-radius:18px}",
    "@keyframes igshimmer{to{background-position:-200% 0}}",
    "@media (prefers-reduced-motion:reduce){.ig-skeleton{animation:none}.ig-card,.ig-thumb img{transition:none}}"
  ].join("");

  var MESSAGES = {
    not_configured: ["Instagram is not connected yet.",
      "Once the Moyenda Instagram account is connected, its latest posts appear here automatically."],
    pending: ["Posts are being prepared.", "Recent posts will appear here after the next synchronisation."],
    token_expired: ["Instagram needs to be reconnected.",
      "The access token has expired, so the newest posts cannot be loaded. The most recent saved posts are shown."],
    error: ["Instagram is temporarily unavailable.",
      "Please check back shortly, or follow us on Instagram directly."]
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function followButton(label) {
    var a = el("a", "btn btn-gold", label || "Follow Us on Instagram");
    a.href = INSTAGRAM_URL;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function notice(state) {
    var msg = MESSAGES[state] || MESSAGES.error;
    var box = el("div", "ig-notice");
    box.setAttribute("role", "status");
    box.appendChild(el("strong", null, msg[0]));
    box.appendChild(el("span", null, msg[1]));
    return box;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function card(item) {
    var a = el("a", "ig-card");
    a.href = item.permalink;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "View this post on Instagram");

    var thumb = el("div", "ig-thumb");
    var src = item.thumbnail_url || item.media_url;
    if (src) {
      var img = el("img");
      img.src = src;
      img.alt = item.caption ? String(item.caption).slice(0, 120) : "Moyenda Tour Guide Instagram post";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = function () { thumb.textContent = ""; thumb.appendChild(placeholder()); };
      thumb.appendChild(img);
    } else {
      thumb.appendChild(placeholder());
    }
    if (item.media_type === "VIDEO") thumb.appendChild(el("span", "ig-badge", "Reel / Video"));
    else if (item.media_type === "CAROUSEL_ALBUM") thumb.appendChild(el("span", "ig-badge", "Album"));
    a.appendChild(thumb);

    var body = el("div", "ig-body");
    body.appendChild(el("span", "ig-date", formatDate(item.posted_at)));
    body.appendChild(el("p", "ig-caption", item.caption || ""));
    body.appendChild(el("span", "ig-link", "View on Instagram \u2192"));
    a.appendChild(body);
    return a;
  }

  function placeholder() {
    var p = el("div", "ig-placeholder", "Moyenda Tour Guide");
    p.style.cssText = "height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#2C99D6,#16273D);color:#fff;font:700 15px system-ui,sans-serif";
    return p;
  }

  function render(container, data, state) {
    container.textContent = "";
    var items = data.items || [];

    if (state === "not_configured" || (items.length === 0 && state !== "ok")) {
      container.appendChild(notice(state));
      container.appendChild(el("div", "ig-more")).appendChild(followButton());
      return;
    }
    if (items.length === 0) {
      container.appendChild(notice("pending"));
      return;
    }
    if (state === "token_expired" || state === "error") {
      container.appendChild(notice(state));
    }
    var grid = el("div", "ig-grid");
    items.forEach(function (item) { grid.appendChild(card(item)); });
    container.appendChild(grid);
  }

  function fetchPage(page, limit) {
    var client = window.moyendaSupabase;
    if (!client) return Promise.reject(new Error("Supabase is not configured."));
    var start = (page - 1) * limit;
    return client.from("instagram_media")
      .select("id,media_type,caption,media_url,thumbnail_url,permalink,posted_at")
      .order("posted_at", { ascending: false })
      .range(start, start + limit - 1)
      .then(function (result) {
        if (result.error) throw result.error;
        var items = result.data || [];
        return { items: items, status: items.length ? "ok" : "pending", hasMore: items.length === limit };
      });
  }

  function init(container) {
    var limit = parseInt(container.getAttribute("data-limit"), 10) || 12;
    var paginate = container.getAttribute("data-paginate") === "true";
    var page = 1;
    var all = [];

    if (!window.moyendaSupabase) {
      render(container, { items: [] }, "not_configured");
      return;
    }

    container.innerHTML = "";
    var skeleton = el("div", "ig-grid");
    for (var i = 0; i < Math.min(limit, 6); i++) skeleton.appendChild(el("div", "ig-skeleton"));
    container.appendChild(skeleton);

    function load(p) {
      return fetchPage(p, limit).then(function (data) {
        all = all.concat(data.items || []);
        var state = data.status || "ok";
        render(container, { items: all }, state);
        if (paginate && data.hasMore) {
          var more = el("div", "ig-more");
          var btn = el("button", null, "Load older posts");
          btn.type = "button";
          btn.addEventListener("click", function () {
            btn.disabled = true;
            btn.textContent = "Loading...";
            page += 1;
            load(page).catch(function () { btn.disabled = false; btn.textContent = "Try again"; });
          });
          more.appendChild(btn);
          container.appendChild(more);
        }
        return data;
      });
    }

    load(page).catch(function (error) {
      console.error("Could not load cached Instagram posts from Supabase.", error);
      render(container, { items: [] }, window.moyendaSupabase ? "error" : "not_configured");
    });
  }

  function start() {
    var containers = document.querySelectorAll("[data-instagram]");
    if (!containers.length) return;
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
    containers.forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
