/* MOYENDA AI GUIDE: chat widget. Injected on every public page.
   Talks only to the server function (/api/ai-guide). No keys live here.
   Replies are inserted as text (textContent), never as HTML. */
(function () {
  "use strict";

  var ENDPOINT = window.moyendaApiUrl("/api/ai-guide");
  var CONV_KEY = "moyendaAiConversation";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = [
    ".ai-fab{position:fixed;right:20px;bottom:24px;z-index:110;display:flex;align-items:center;gap:10px;",
    "background:#EB2F33;color:#fff;border:0;border-radius:999px;padding:14px 20px;font:700 15px/1 system-ui,sans-serif;",
    "cursor:pointer;box-shadow:0 14px 30px rgba(235,47,51,.4);transition:transform .25s}",
    ".ai-fab:hover{transform:translateY(-3px)}",
    ".ai-fab:focus-visible{outline:3px solid #2C99D6;outline-offset:3px}",
    ".ai-panel{position:fixed;right:20px;bottom:90px;z-index:111;width:min(380px,calc(100vw - 40px));height:min(560px,70vh);",
    "background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(14,27,44,.28);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif}",
    ".ai-panel.open{display:flex}",
    ".ai-head{background:#0E1B2C;color:#fff;padding:16px 18px;display:flex;justify-content:space-between;align-items:center}",
    ".ai-head strong{font-size:15px;letter-spacing:.02em}",
    ".ai-head small{display:block;color:#AFC2D6;font-size:12px;margin-top:2px}",
    ".ai-close{background:none;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1}",
    ".ai-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F8FAFC}",
    ".ai-msg{max-width:86%;padding:10px 14px;border-radius:14px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;color:#0E1B2C}",
    ".ai-msg.user{align-self:flex-end;background:#2C99D6;color:#fff;border-bottom-right-radius:4px}",
    ".ai-msg.bot{align-self:flex-start;background:#fff;border:1px solid #E2E8F0;border-bottom-left-radius:4px}",
    ".ai-msg.error{background:#FDECEC;border-color:#F5B5B6;color:#7A1412}",
    ".ai-chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 10px;background:#F8FAFC}",
    ".ai-chips button{border:1.5px solid #2C99D6;background:#fff;color:#1C6F9E;border-radius:999px;padding:7px 12px;font:600 12.5px system-ui,sans-serif;cursor:pointer}",
    ".ai-chips button:hover{background:#E6F3FB}",
    ".ai-form{display:flex;gap:8px;padding:12px;border-top:1px solid #E2E8F0;background:#fff}",
    ".ai-form input{flex:1;border:1.5px solid #E2E8F0;border-radius:12px;padding:11px 13px;font:15px system-ui,sans-serif;color:#0E1B2C}",
    ".ai-form input:focus{outline:none;border-color:#2C99D6;box-shadow:0 0 0 4px rgba(44,153,214,.18)}",
    ".ai-form button{background:#EB2F33;color:#fff;border:0;border-radius:12px;padding:0 16px;font:700 14px system-ui,sans-serif;cursor:pointer}",
    ".ai-form button:disabled{opacity:.55;cursor:default}",
    ".ai-typing{color:#55627A;font-size:13px;font-style:italic}",
    "@media (max-width:1000px){.ai-fab{bottom:88px}.ai-panel{bottom:156px}}",
    "@media (prefers-reduced-motion:reduce){.ai-fab{transition:none}}"
  ].join("");

  var suggestions = [
    "Which tour suits a first-time visitor?",
    "What should I bring for a hike?",
    "How do I book a tour?"
  ];

  var conversationId = null;
  try { conversationId = sessionStorage.getItem(CONV_KEY); } catch (e) {}

  var fab, panel, log, form, input, sendBtn, chips;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function addMessage(role, text) {
    var m = el("div", "ai-msg " + role, text);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
  }

  function send(text) {
    text = (text || "").trim();
    if (!text) return;
    if (chips) chips.remove();
    chips = null;
    addMessage("user", text);
    input.value = "";
    setBusy(true);
    var typing = el("div", "ai-typing", "MOYENDA AI GUIDE is checking our guide...");
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversationId: conversationId,
        pagePath: window.location.pathname
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        typing.remove();
        if (!r.ok) {
          addMessage("bot error", r.data.error || "The guide is unavailable right now. Please try again shortly.");
          return;
        }
        conversationId = r.data.conversationId;
        try { sessionStorage.setItem(CONV_KEY, conversationId); } catch (e) {}
        addMessage("bot", r.data.answer);
      })
      .catch(function () {
        typing.remove();
        addMessage("bot error", "Connection problem. Please check your internet and try again, or message us on WhatsApp.");
      })
      .finally(function () {
        setBusy(false);
        input.focus();
      });
  }

  function toggle(open) {
    var isOpen = typeof open === "boolean" ? open : !panel.classList.contains("open");
    panel.classList.toggle("open", isOpen);
    fab.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) input.focus();
  }

  function build() {
    var style = el("style");
    style.textContent = css;
    document.head.appendChild(style);

    fab = el("button", "ai-fab");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "ai-panel");
    fab.innerHTML = '<span aria-hidden="true">&#9679;</span> Ask MOYENDA AI GUIDE';
    fab.addEventListener("click", function () { toggle(); });

    panel = el("div", "ai-panel");
    panel.id = "ai-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "MOYENDA AI GUIDE");

    var head = el("div", "ai-head");
    var title = el("div");
    title.appendChild(el("strong", null, "MOYENDA AI GUIDE"));
    title.appendChild(el("small", null, "Answers from our verified tour information"));
    var close = el("button", "ai-close", "\u00D7");
    close.setAttribute("aria-label", "Close guide");
    close.addEventListener("click", function () { toggle(false); });
    head.appendChild(title);
    head.appendChild(close);

    log = el("div", "ai-log");
    log.setAttribute("aria-live", "polite");
    addMessage("bot", "Hello. I can help with our tours, destinations, what to pack and how to book. What would you like to know?");

    chips = el("div", "ai-chips");
    suggestions.forEach(function (s) {
      var b = el("button", null, s);
      b.type = "button";
      b.addEventListener("click", function () { send(s); });
      chips.appendChild(b);
    });

    form = el("form", "ai-form");
    form.setAttribute("autocomplete", "off");
    input = el("input");
    input.type = "text";
    input.maxLength = 500;
    input.placeholder = "Ask a question...";
    input.setAttribute("aria-label", "Your question");
    sendBtn = el("button", null, "Send");
    sendBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(sendBtn);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(input.value);
    });

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chips);
    panel.appendChild(form);

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) toggle(false);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    build();
  });
})();
