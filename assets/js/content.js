/* Renders published Supabase content. Uses textContent only (no HTML from the database).
   Empty and error states say so plainly. Nothing is invented on the client. */
(function () {
  "use strict";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null && text !== "") n.textContent = text;
    return n;
  }

  function notice(title, body) {
    var box = el("div", "ig-notice");
    box.setAttribute("role", "status");
    box.appendChild(el("strong", null, title));
    box.appendChild(el("span", null, body));
    return box;
  }

  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }

  function localImage(container, path, alt) {
    if (typeof path !== "string" ||
        !/^assets\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path) ||
        path.indexOf("..") !== -1) return;
    var image = el("img", "card-img");
    image.src = path;
    image.alt = alt || "";
    image.loading = "lazy";
    image.decoding = "async";
    container.appendChild(image);
  }

  function emptyState(container, what) {
    container.textContent = "";
    container.appendChild(notice(
      "Coming soon",
      what + " will be published here once the details have been confirmed with Moyenda Tour Guide. " +
      "For current information, please contact us."
    ));
    container.appendChild(el("p", "center", ""));
    var a = el("a", "btn btn-gold", "Contact Us");
    a.href = "contact.html";
    container.appendChild(a);
  }

  function errorState(container) {
    container.textContent = "";
    container.appendChild(notice("Temporarily unavailable", "This content could not be loaded. Please check back shortly."));
  }

  function packageCard(p) {
    var card = el("article", "card reveal in");
    localImage(card, p.image_path, p.title);
    var body = el("div", "card-body");
    body.appendChild(el("h3", null, p.title));
    if (p.duration) body.appendChild(el("span", "tag", p.duration));
    if (p.summary) body.appendChild(el("p", null, p.summary));
    if (p.includes) body.appendChild(el("p", "form-note", "Includes: " + p.includes));
    if (p.price_text) body.appendChild(el("p", null, "Price: " + p.price_text));
    var btn = el("a", "btn btn-gold", "Enquire About This Package");
    btn.href = "contact.html?activity=" + encodeURIComponent("Not sure yet") + "&package=" + encodeURIComponent(p.title);
    body.appendChild(btn);
    card.appendChild(body);
    return card;
  }

  function accommodationCard(a) {
    var card = el("article", "card reveal in");
    localImage(card, a.image_path, a.name);
    var body = el("div", "card-body");
    body.appendChild(el("h3", null, a.name));
    if (a.location) body.appendChild(el("span", "tag", a.location));
    if (a.description) body.appendChild(el("p", null, a.description));
    if (a.price_text) body.appendChild(el("p", null, "Price: " + a.price_text));
    if (a.contact_note) body.appendChild(el("p", "form-note", a.contact_note));
    var btn = el("a", "btn btn-green", "Ask About This Accommodation");
    btn.href = "contact.html";
    body.appendChild(btn);
    card.appendChild(body);
    return card;
  }

  function blogCard(p) {
    var card = el("article", "card reveal in");
    var body = el("div", "card-body");
    if (p.published_at) body.appendChild(el("span", "tag", fmt(p.published_at)));
    body.appendChild(el("h3", null, p.title));
    if (p.excerpt) body.appendChild(el("p", null, p.excerpt));
    var a = el("a", "card-link", "Read article \u2192");
    a.href = "article.html?slug=" + encodeURIComponent(p.slug);
    body.appendChild(a);
    card.appendChild(body);
    return card;
  }

  function renderList(container, type, emptyLabel, build) {
    container.textContent = "";
    container.appendChild(el("p", "form-note", "Loading..."));
    var client = window.moyendaSupabase;
    if (!client) return errorState(container);
    var table = type === "blog" ? "blog_posts" : type;
    var query = client.from(table).select("*").eq("status", "published");
    query = type === "blog" ?
      query.order("published_at", { ascending: false }) :
      query.order("sort_order", { ascending: true });
    query.then(function (result) {
        container.textContent = "";
        if (result.error) throw result.error;
        if (!result.data || !result.data.length) return emptyState(container, emptyLabel);
        var grid = el("div", "grid-3");
        result.data.forEach(function (item) { grid.appendChild(build(item)); });
        container.appendChild(grid);
      })
      .catch(function (error) {
        console.error("Could not load published " + type + " from Supabase.", error);
        errorState(container);
      });
  }

  function renderArticle(container) {
    var slug = new URLSearchParams(window.location.search).get("slug") || "";
    if (!/^[a-z0-9-]{3,120}$/.test(slug)) return emptyState(container, "This article");
    var client = window.moyendaSupabase;
    if (!client) return errorState(container);
    client.from("blog_posts").select("slug,title,excerpt,body,published_at")
      .eq("status", "published").eq("slug", slug).maybeSingle()
      .then(function (result) {
        container.textContent = "";
        if (result.error) throw result.error;
        if (!result.data) return emptyState(container, "This article");
        var item = result.data;
        document.title = item.title + " | Moyenda Tour Guide";
        container.appendChild(el("h1", null, item.title));
        if (item.published_at) container.appendChild(el("p", "form-note", fmt(item.published_at)));
        if (item.excerpt) container.appendChild(el("p", "lead", item.excerpt));
        (item.body || "").split(/\n{2,}/).forEach(function (para) {
          if (para.trim()) container.appendChild(el("p", null, para.trim()));
        });
      })
      .catch(function (error) {
        console.error("Could not load the published article from Supabase.", error);
        errorState(container);
      });
  }

  function start() {
    document.querySelectorAll("[data-content]").forEach(function (container) {
      var type = container.getAttribute("data-content");
      if (type === "packages") renderList(container, "packages", "Tour packages", packageCard);
      else if (type === "accommodation") renderList(container, "accommodation", "Accommodation listings", accommodationCard);
      else if (type === "blog") renderList(container, "blog", "Travel articles", blogCard);
      else if (type === "article") renderArticle(container);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
