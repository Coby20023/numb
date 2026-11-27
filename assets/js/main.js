/* Moyenda Tour Guide, shared behaviour for all pages */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var CONFIG = {
    whatsapp: "265888284485",               // international format, no +
    email: "aaronmoyenda293@gmail.com",
    logoPath: "assets/images/moyenda-logo.jpg",
    loaderMinMs: 1000,                       // brand moment before fade
    loaderMaxMs: 4000                        // never block the visitor longer than this
  };

  var SESSION_KEY = "moyendaSeen";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Loader (shown once per browsing session) ---------- */
  function initLoader() {
    var loader = document.getElementById("loader");
    if (!loader) return;

    var seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) {}
    if (seen) { loader.remove(); return; }

    var start = Date.now();
    var finished = false;

    function hide() {
      if (finished) return;
      finished = true;
      loader.classList.add("hide");
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {}
      setTimeout(function () { loader.remove(); }, reduceMotion ? 0 : 750);
    }

    function afterLoad() {
      var wait = Math.max(0, CONFIG.loaderMinMs - (Date.now() - start));
      setTimeout(hide, reduceMotion ? 0 : wait);
    }

    // Preload the logo; success or failure both lead to the page appearing.
    var logo = new Image();
    logo.onload = logo.onerror = afterLoad;
    logo.src = CONFIG.logoPath;

    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad);

    // Failsafe: visitor is never stuck on the loader.
    setTimeout(hide, CONFIG.loaderMaxMs);
  }

  /* ---------- Single source of truth for the main navigation ---------- */
  var NAV = [
    ["index.html", "Home"], ["activities.html", "Activities"], ["destinations.html", "Destinations"],
    ["packages.html", "Packages"], ["accommodation.html", "Accommodation"], ["gallery.html", "Gallery"],
    ["blog.html", "Travel Blog"], ["instagram.html", "Instagram"], ["about.html", "About Us"], ["contact.html", "Contact"]
  ];

  function buildNav(links) {
    var here = (window.location.pathname.split("/").pop() || "index.html");
    if (here === "" || here === "/") here = "index.html";
    links.textContent = "";
    NAV.forEach(function (item) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = item[0];
      a.textContent = item[1];
      if (item[0] === here || (here === "article.html" && item[0] === "blog.html")) a.className = "active";
      li.appendChild(a);
      links.appendChild(li);
    });
  }

  // Privacy and Terms links in every footer's Company column.
  function addLegalLinks() {
    document.querySelectorAll("footer h4").forEach(function (h) {
      if (h.textContent.trim() !== "Company") return;
      var list = h.parentElement && h.parentElement.querySelector("ul");
      if (!list || list.querySelector('a[href="privacy.html"]')) return;
      [["privacy.html", "Privacy Policy"], ["terms.html", "Terms & Conditions"]].forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = item[0];
        a.textContent = item[1];
        li.appendChild(a);
        list.appendChild(li);
      });
    });
  }

  /* ---------- Navigation: mobile menu, booking CTAs ---------- */
  function initNav() {
    var toggle = document.getElementById("menu-toggle");
    var links = document.getElementById("nav-links");
    if (!links) return;
    buildNav(links);
    addLegalLinks();

    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    // Mobile CTA inside the drop-down menu.
    var li = document.createElement("li");
    li.className = "nav-mobile-cta";
    li.innerHTML = '<a class="btn btn-gold" href="contact.html">Book Your Adventure</a>';
    links.appendChild(li);

    // Desktop CTA beside the menu links.
    var nav = document.querySelector("header .nav");
    if (nav && toggle) {
      var cta = document.createElement("a");
      cta.className = "btn btn-gold nav-cta";
      cta.href = "contact.html";
      cta.textContent = "Book a Tour";
      nav.insertBefore(cta, nav.querySelector(".nav-actions") || toggle);
    }
  }

  /* ---------- Sticky mobile booking bar (hidden on the contact page) ---------- */
  function initMobileBook() {
    if (/contact\.html$/.test(window.location.pathname)) return;
    var bar = document.createElement("div");
    bar.className = "mobile-book";
    bar.innerHTML = '<a class="btn btn-gold" href="contact.html">Book Your Adventure</a>';
    document.body.appendChild(bar);
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    var selectors = ".card, .feature, .activity, .panel, .section-head, .gallery-grid figure, .stats, .contact-line, .cta-band h2";
    var items = document.querySelectorAll(selectors);
    if (!items.length) return;

    items.forEach(function (el, i) {
      el.classList.add("reveal");
      el.classList.add("d" + ((i % 3) + 1));
    });

    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Back to top ---------- */
  function initBackToTop() {
    var btn = document.createElement("button");
    btn.className = "to-top";
    btn.setAttribute("aria-label", "Back to top");
    btn.innerHTML = "&#8593;";
    document.body.appendChild(btn);
    window.addEventListener("scroll", function () {
      btn.classList.toggle("show", window.scrollY > 500);
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Gallery filter and lightbox ---------- */
  function initGallery() {
    var figures = document.querySelectorAll(".gallery-grid figure");
    if (!figures.length) return;

    var buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.getAttribute("data-filter");
        buttons.forEach(function (b) { b.classList.toggle("active", b === btn); });
        figures.forEach(function (fig) {
          var match = f === "all" || fig.getAttribute("data-cat") === f;
          fig.classList.toggle("hidden", !match);
        });
      });
    });

    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = '<button aria-label="Close">&times;</button><div><img alt=""><p></p></div>';
    document.body.appendChild(box);
    var boxImg = box.querySelector("img");
    var boxCap = box.querySelector("p");

    function close() { box.classList.remove("open"); }
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.tagName === "BUTTON") close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    figures.forEach(function (fig) {
      fig.setAttribute("tabindex", "0");
      function open() {
        var img = fig.querySelector("img");
        boxImg.src = img.src;
        boxImg.alt = img.alt;
        boxCap.textContent = fig.querySelector("figcaption").textContent;
        box.classList.add("open");
        box.querySelector("button").focus();
      }
      fig.addEventListener("click", open);
      fig.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
    });
  }

  /* ---------- Booking form: save directly to Supabase and hand off to WhatsApp ---------- */
  function initBookingForm() {
    var form = document.getElementById("booking-form");
    if (!form) return;
    var notice = document.getElementById("form-notice");

    // Pre-select an activity when arriving from an "Enquire" link.
    var wanted = new URLSearchParams(window.location.search).get("activity");
    if (wanted) {
      var select = form.elements["activity"];
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === wanted || select.options[i].text === wanted) {
          select.selectedIndex = i;
          break;
        }
      }
    }

    function fieldError(field, ok) {
      field.classList.toggle("invalid", !ok);
      var err = field.parentElement.querySelector(".error");
      if (err) err.textContent = ok ? "" : (field.getAttribute("data-error") || "Please check this field.");
      return ok;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var valid = true;
      form.querySelectorAll("[required]").forEach(function (f) {
        var ok = f.value.trim() !== "";
        if (f.type === "email" && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim());
        if (f.type === "number" && ok) ok = Number(f.value) >= 1 && Number(f.value) <= 50;
        valid = fieldError(f, ok) && valid;
      });
      if (!valid) {
        notice.classList.remove("show");
        var first = form.querySelector(".invalid");
        if (first) first.focus();
        return;
      }

      // Open WhatsApp immediately so the browser does not block the new tab.
      var v = function (name) { return (form.elements[name].value || "").trim(); };
      if (v("date")) {
        var today = new Date();
        var todayText = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" +
          String(today.getDate()).padStart(2, "0");
        if (v("date") < todayText) {
          notice.textContent = "Please choose today or a future date.";
          notice.classList.add("show");
          form.elements.namedItem("date").focus();
          return;
        }
      }
      if (v("website")) {
        notice.textContent = "This request could not be submitted. Please try again or contact us on WhatsApp.";
        notice.classList.add("show");
        return;
      }
      if (v("name").length > 120 || v("email").length > 200 || v("phone").length > 40 || v("message").length > 2000) {
        notice.textContent = "Please shorten one or more fields and try again.";
        notice.classList.add("show");
        return;
      }
      var msg = [
        "Booking enquiry - Moyenda Tour Guide",
        "Name: " + v("name"),
        "Email: " + v("email"),
        "Phone/WhatsApp: " + v("phone"),
        "Activity: " + v("activity"),
        "Destination: " + v("destination"),
        "Preferred date: " + (v("date") || "Flexible"),
        "Participants: " + v("participants"),
        "Message: " + (v("message") || "-")
      ].join("\n");

      window.open("https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(msg), "_blank", "noopener");

      var client = window.moyendaSupabase;
      if (!client) {
        notice.textContent = "Your WhatsApp message is ready. Supabase is not configured, so the request was not saved online.";
        notice.classList.add("show");
        return;
      }
      notice.textContent = "Your enquiry is ready in WhatsApp. Saving your request...";
      notice.classList.add("show");
      client.from("bookings").insert({
          full_name: v("name"),
          email: v("email"),
          phone: v("phone"),
          activity: v("activity"),
          destination: v("destination") || null,
          tour_date: v("date") || null,
          participants: Number(v("participants")),
          message: v("message") || null,
          status: "requested"
        })
        .then(function (result) {
          if (result.error) throw result.error;
          notice.textContent = "Your request has been received and is not confirmed until our team replies. Send the prepared WhatsApp message to check availability.";
          form.reset();
        })
        .catch(function (error) {
          notice.textContent = "Your WhatsApp message is ready, but your request could not be saved automatically. Please send the message to us so we can assist you. " +
            (error.message || "");
        });
    });
  }

  /* ---------- General contact inquiries ---------- */
  function initInquiryForm() {
    var form = document.getElementById("inquiry-form");
    if (!form) return;
    var notice = document.getElementById("inquiry-notice");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = function (name) { return (form.elements[name].value || "").trim(); };
      if (!form.reportValidity()) return;
      if (value("website")) {
        notice.textContent = "This message could not be submitted. Please try again.";
        notice.classList.add("show");
        return;
      }
      if (!window.moyendaSupabase) {
        notice.textContent = "The message could not be saved because Supabase is not configured. Please contact us by phone or WhatsApp.";
        notice.classList.add("show");
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      notice.textContent = "Sending your message...";
      notice.classList.add("show");
      window.moyendaSupabase.from("customer_inquiries").insert({
        name: value("name"),
        email: value("email"),
        phone: value("phone") || null,
        subject: value("subject"),
        message: value("message"),
        status: "new"
      }).then(function (result) {
        if (result.error) throw result.error;
        notice.textContent = "Thank you. Your message has been received.";
        form.reset();
      }).catch(function (error) {
        notice.textContent = "Your message could not be sent. Please contact us by phone or WhatsApp. " + (error.message || "");
      }).then(function () {
        submit.disabled = false;
      });
    });
  }

  /* ---------- Light / dark theme switch ----------
     Remembers the visitor's choice on this device (a display preference, not a login).
     Without a choice, follows the device's light or dark setting. */
  var THEME_KEY = "moyendaTheme";

  function currentTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var dark = theme === "dark";
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.textContent = dark ? "\u2600" : "\u263E";   // sun or moon
    }
  }

  function initTheme() {
    applyTheme(currentTheme());
    var nav = document.querySelector("header .nav");
    var toggle = document.getElementById("menu-toggle");
    if (!nav || document.getElementById("theme-toggle")) return;
    var btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });
    var actions = document.createElement("div");
    actions.className = "nav-actions";
    nav.insertBefore(actions, toggle || null);
    actions.appendChild(btn);
    if (toggle) actions.appendChild(toggle);
    applyTheme(currentTheme());
  }

  /* ---------- Footer year ---------- */
  function initYear() {
    document.querySelectorAll(".year").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------- AI guide widget, loaded on every public page ---------- */
  function initAiGuide() {
    if (window.MOYENDA_API_ENABLED !== true) return;
    var s = document.createElement("script");
    s.src = "assets/js/ai-guide.js";
    s.defer = true;
    document.body.appendChild(s);
  }

  /* ---------- Instagram display, only on pages that contain an Instagram container ---------- */
  function initInstagram() {
    if (!document.querySelector("[data-instagram]")) return;
    var s = document.createElement("script");
    s.src = "assets/js/instagram.js";
    s.defer = true;
    document.body.appendChild(s);
  }

  /* ---------- Floating WhatsApp button ----------
     Business number is configured in SETTINGS below. Change it here only. */
  var SETTINGS = {
    whatsappNumber: "265888284485",      // international format, digits only (from the client's logo)
    whatsappMessage: "Hello Moyenda Tour Guide, I would like to ask about a tour."
  };

  function initWhatsApp() {
    if (!window.moyendaSupabase) return buildWhatsApp();
    window.moyendaSupabase.from("site_settings").select("value").eq("key", "whatsapp_number").maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (result.data) SETTINGS.whatsappNumber = String(result.data.value || "").replace(/\D/g, "");
      })
      .catch(function (error) { console.error("Could not load the WhatsApp setting from Supabase.", error); })
      .then(buildWhatsApp);
  }

  function buildWhatsApp() {
    if (!SETTINGS.whatsappNumber) return;
    var style = document.createElement("style");
    style.textContent =
      ".wa-fab{position:fixed;right:20px;bottom:84px;z-index:112;width:56px;height:56px;border-radius:50%;" +
      "background:#25D366;color:#fff;display:grid;place-items:center;box-shadow:0 12px 26px rgba(37,211,102,.45);" +
      "transition:transform .25s cubic-bezier(.2,.7,.2,1)}" +
      ".wa-fab:hover{transform:translateY(-3px) scale(1.04)}" +
      ".wa-fab:focus-visible{outline:3px solid #0E1B2C;outline-offset:3px}" +
      ".wa-fab svg{width:30px;height:30px;fill:currentColor}" +
      "@media (max-width:1000px){.wa-fab{bottom:150px}}" +
      "@media (prefers-reduced-motion:reduce){.wa-fab{transition:none}}";
    document.head.appendChild(style);

    var a = document.createElement("a");
    a.className = "wa-fab";
    a.href = "https://wa.me/" + SETTINGS.whatsappNumber + "?text=" + encodeURIComponent(SETTINGS.whatsappMessage);
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Chat with Moyenda Tour Guide on WhatsApp");
    a.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l4.98-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.15l-.3-.18-2.95.77.79-2.87-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.17.25-.63.8-.77.97-.14.17-.29.18-.54.06a6.7 6.7 0 01-2-1.23 7.5 7.5 0 01-1.38-1.72c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.75-1.82-.2-.47-.4-.41-.55-.42h-.47a.9.9 0 00-.65.3 2.74 2.74 0 00-.86 2.04c0 1.2.88 2.36 1 2.52.12.17 1.73 2.64 4.2 3.7 2.47 1.07 2.47.71 2.92.67.45-.04 1.46-.6 1.66-1.18.2-.58.2-1.07.14-1.18-.06-.12-.22-.18-.47-.3z"/></svg>';
    document.body.appendChild(a);
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initAiGuide();
    initInstagram();
    initWhatsApp();
    initYear();
    initTheme();
    initNav();
    initMobileBook();
    initReveal();
    initBackToTop();
    initGallery();
    initBookingForm();
    initInquiryForm();
    initLoader();
  });
})();
