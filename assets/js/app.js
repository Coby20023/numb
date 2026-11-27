/* Public Supabase client shared by static pages. Only a publishable/anon key belongs here. */
(function () {
  "use strict";

  window.MOYENDA_SUPABASE_URL = "https://jvofkvfprczdtbppyiqc.supabase.co"; // Set the Supabase project URL.
  window.MOYENDA_SUPABASE_KEY = "sb_publishable_G4RSHbM-H_5OqjlE2mxLwg_Ym3nWUo2"; // Set the public anon/publishable key only.
  var client = null;
  var storageBucket = "moyenda-gallery";
  var tables = {
    destinations: {
      table: "destinations",
      select: "name,slug,summary,image_path,sort_order",
      href: "destinations.html"
    },
    activities: {
      table: "activities",
      select: "name,slug,category,summary,image_path,sort_order",
      href: "activities.html"
    },
    packages: {
      table: "packages",
      select: "title,summary,duration,price_text,image_path,sort_order",
      href: "packages.html"
    },
    accommodation: {
      table: "accommodation",
      select: "name,location,description,price_text,image_path,sort_order",
      href: "accommodation.html"
    },
    gallery_items: {
      table: "gallery_items",
      select: "title,alt_text,category,image_path,storage_path,sort_order",
      href: "gallery.html"
    },
    blog_posts: {
      table: "blog_posts",
      select: "title,slug,excerpt,published_at",
      href: "blog.html",
      order: "published_at",
      ascending: false
    }
  };
  var detailPages = {
    hiking: "hiking.html",
    "game-drive": "game-drive.html",
    "lake-malawi": "lake-malawi.html"
  };

  function isServiceRoleKey(key) {
    if (/service[_-]?role|sb_secret/i.test(key)) return true;
    var parts = key.split(".");
    if (parts.length !== 3) return false;
    try {
      var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      return JSON.parse(window.atob(payload)).role === "service_role";
    } catch (e) {
      return false;
    }
  }

  function configureClient() {
    if (client) return client;
    var supabaseUrl = String(window.MOYENDA_SUPABASE_URL || "").trim();
    var supabaseKey = String(window.MOYENDA_SUPABASE_KEY || "").trim();
    if (!supabaseUrl && !supabaseKey) return null;
    if (!supabaseUrl || !supabaseKey || /YOUR[-_ ]|PLACEHOLDER/i.test(supabaseUrl + " " + supabaseKey)) {
      throw new Error("Set both the Supabase project URL and public key in assets/js/app.js.");
    }
    if (isServiceRoleKey(supabaseKey)) {
      throw new Error("Use a Supabase publishable/anon key, never a service-role key.");
    }
    var url;
    try { url = new URL(supabaseUrl); } catch (e) { throw new Error("Supabase URL must be a valid HTTPS URL."); }
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("Supabase URL must use HTTPS.");
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("The Supabase JavaScript client did not load. Check the CDN connection and Content Security Policy.");
    }
    client = window.supabase.createClient(url.origin.replace(/\/+$/, ""), supabaseKey);
    window.moyendaSupabase = client;
    return client;
  }

  function fetchRows(section, container) {
    var config = tables[section];
    var limit = parseInt(container.getAttribute("data-home-limit"), 10) || 6;
    return client.from(config.table).select(config.select).eq("status", "published")
      .order(config.order || "sort_order", { ascending: config.ascending !== false }).limit(limit)
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data || [];
      });
  }

  function safeImagePath(path) {
    return typeof path === "string" &&
      /^assets\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path) &&
      path.indexOf("..") === -1;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function renderCard(section, item) {
    var config = tables[section];
    var card = element("article", "card reveal in");
    var imageUrl = safeImagePath(item.image_path) ? item.image_path :
      (section === "gallery_items" && item.storage_path ? client.storage.from(storageBucket).getPublicUrl(item.storage_path).data.publicUrl : "");
    if (imageUrl) {
      var image = element("img", "card-img");
      image.src = imageUrl;
      image.alt = item.alt_text || item.name || item.title || "";
      image.loading = "lazy";
      image.decoding = "async";
      card.appendChild(image);
    }

    var body = element("div", "card-body");
    var title = item.name || item.title;
    body.appendChild(element("h3", null, title));
    if (item.category || item.location || item.duration) {
      body.appendChild(element("span", "tag", item.category || item.location || item.duration));
    }
    var description = item.summary || item.excerpt || item.description || item.includes || item.alt_text;
    if (description) body.appendChild(element("p", null, description));
    if (item.price_text) body.appendChild(element("p", "form-note", "Price: " + item.price_text));

    var link = element("a", "card-link", section === "blog_posts" ? "Read article \u2192" : "Explore details \u2192");
    link.href = section === "blog_posts" ? "article.html?slug=" + encodeURIComponent(item.slug) :
      (Object.prototype.hasOwnProperty.call(detailPages, item.slug) ? detailPages[item.slug] : config.href);
    body.appendChild(link);
    card.appendChild(body);
    return card;
  }

  function showError(container, error) {
    var status = element("p", "home-data-status", "Published content could not be loaded. " + error.message);
    status.setAttribute("role", "status");
    container.appendChild(status);
  }

  function renderSection(container) {
    var section = container.getAttribute("data-home-list");
    if (!Object.prototype.hasOwnProperty.call(tables, section)) return Promise.resolve();
    return fetchRows(section, container).then(function (items) {
      if (!Array.isArray(items) || items.length === 0) return;
      container.textContent = "";
      items.forEach(function (item) { container.appendChild(renderCard(section, item)); });
    }).catch(function (error) {
      showError(container, error);
    });
  }

  function renderSiteContent() {
    return client.from("website_content").select("content_key,value").eq("status", "published")
      .then(function (result) {
      if (result.error) throw result.error;
      return result.data || [];
    }).then(function (items) {
      items.forEach(function (item) {
        var target = document.querySelector('[data-site-content="' + item.content_key + '"]');
        if (target && typeof item.value === "string" && item.value.trim()) target.textContent = item.value;
      });
    });
  }

  /* ---- Page backgrounds (set from the admin dashboard, stored in site_settings as bg_<page>) ---- */
  function pageKey() {
    var name = (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "");
    return name || "index";
  }

  function parseBg(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(value) || {}; } catch (e) { return {}; }
  }

  function hasBg(bg) {
    return Boolean(bg && (bg.color || bg.image_path || bg.storage_path));
  }

  function applyBackground(bg) {
    if (!hasBg(bg)) return;
    var style = document.body.style;
    if (/^#[0-9a-f]{3,8}$/i.test(bg.color || "")) style.backgroundColor = bg.color;
    var image = "";
    if (safeImagePath(bg.image_path)) image = bg.image_path;
    else if (typeof bg.storage_path === "string" && /^backgrounds\/[A-Za-z0-9._-]+$/.test(bg.storage_path)) {
      image = client.storage.from(storageBucket).getPublicUrl(bg.storage_path).data.publicUrl;
    }
    if (image) {
      style.backgroundImage = 'url("' + image + '")';
      style.backgroundSize = "cover";
      style.backgroundPosition = "center";
      style.backgroundRepeat = "no-repeat";
      style.backgroundAttachment = "fixed";
    }
  }

  function loadBackground() {
    var key = pageKey();
    return client.from("site_settings").select("key,value").in("key", ["bg_all", "bg_" + key])
      .then(function (result) {
        if (result.error) throw result.error;
        var map = {};
        (result.data || []).forEach(function (row) { map[row.key] = parseBg(row.value); });
        applyBackground(hasBg(map["bg_" + key]) ? map["bg_" + key] : map.bg_all);
      });
  }

  function start() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-home-list]"));
    var hasContent = document.querySelector("[data-site-content]");

    if (!/admin(\.html)?$/i.test(location.pathname)) {
      try { if (configureClient()) loadBackground().catch(function () {}); } catch (e) {}
    }

    if (!sections.length && !hasContent) return;

    try { configureClient(); } catch (error) {
      sections.forEach(function (container) { showError(container, error); });
      if (hasContent) {
        var target = document.querySelector("[data-site-content]");
        if (target) target.insertAdjacentElement("afterend", element("span", "home-data-status", error.message));
      }
      return;
    }
    if (!client) return;

    sections.forEach(function (container) { renderSection(container); });
    if (hasContent) {
      renderSiteContent().catch(function (error) {
        var target = document.querySelector("[data-site-content]");
        if (target) {
          var status = element("span", "home-data-status", error.message);
          status.setAttribute("role", "status");
          target.insertAdjacentElement("afterend", status);
        }
      });
    }
  }

  try { configureClient(); } catch (error) {
    window.moyendaSupabaseConfigError = error;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
