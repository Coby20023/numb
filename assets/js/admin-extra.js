/* Extra admin tools: tab icons, alert badges, Analytics and Export tabs. Loaded by admin.js. */
(function () {
  "use strict";

  var A = window.moyendaAdmin;
  if (!A || !A.client) return;
  var client = A.client, el = A.el, TABS = A.TABS;

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }

  var ICONS = {
    overview: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    analytics: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    bookings: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    inquiries: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    packages: '<path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
    accommodation: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    destinations: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    activities: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    gallery: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    "website-content": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    backgrounds: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M12 12h10"/>',
    blog: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    faq: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    unanswered: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    conversations: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sync: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
    settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    export: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
  };

  var style = document.createElement("style");
  style.textContent =
    ".tabs button{display:inline-flex;align-items:center;gap:6px}.tabs button svg{flex:none}" +
    ".badge{background:var(--accent,#c0392b);color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700}" +
    ".bars{display:flex;align-items:flex-end;gap:3px;height:140px;margin-top:12px}" +
    ".bars span{flex:1;background:var(--primary,#1C6F9E);border-radius:3px 3px 0 0;min-height:2px}" +
    ".rank{display:grid;gap:8px;margin-top:10px}" +
    ".rank div{position:relative;padding:6px 10px;border-radius:8px;background:#EEF3F8;overflow:hidden;font-size:14px;display:flex;justify-content:space-between;gap:10px}" +
    ".rank i{position:absolute;left:0;top:0;bottom:0;background:#CFE3F1}" +
    ".rank b,.rank em{position:relative;font-style:normal}" +
    ".an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:22px}";
  document.head.appendChild(style);

  function fail(content, error) {
    content.textContent = "";
    content.appendChild(el("p", "admin-msg err", "Could not load this section: " + A.errorText(error)));
  }

  function rankList(title, rows) {
    var box = el("div");
    box.appendChild(el("h3", null, title));
    var list = el("div", "rank");
    var max = rows.reduce(function (m, r) { return Math.max(m, r.views); }, 1);
    if (!rows.length) list.appendChild(el("p", "form-note", "No data yet."));
    rows.forEach(function (r) {
      var row = el("div");
      var bar = el("i"); bar.style.width = Math.round(r.views / max * 100) + "%";
      row.appendChild(bar);
      row.appendChild(el("b", null, String(r.name)));
      row.appendChild(el("em", null, String(r.views)));
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function renderAnalytics(content) {
    var days = 30;
    function draw() {
      content.textContent = "Loading...";
      return Promise.all([
        client.rpc("analytics_summary", { days: days }),
        client.from("page_views").select("created_at,page,country,city,device")
          .order("created_at", { ascending: false }).limit(20)
      ]).then(function (res) {
        if (res[0].error) throw res[0].error;
        if (res[1].error) throw res[1].error;
        var d = res[0].data || {};
        content.textContent = "";

        var head = el("div", "row-actions");
        head.style.cssText = "justify-content:space-between;align-items:center";
        head.appendChild(el("h2", null, "Visitor analytics"));
        var pick = el("select");
        [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]].forEach(function (o) {
          var opt = el("option", null, o[1]); opt.value = o[0]; opt.selected = o[0] === days; pick.appendChild(opt);
        });
        pick.style.width = "auto";
        pick.addEventListener("change", function () {
          days = Number(pick.value);
          draw().catch(function (e) { fail(content, e); });
        });
        head.appendChild(pick);
        content.appendChild(head);

        var grid = el("div", "stat-grid");
        [["Page views", d.views], ["Unique visitors", d.visitors], ["Views today", d.today]].forEach(function (p) {
          var card = el("div", "stat");
          card.appendChild(el("strong", null, String(p[1] || 0)));
          card.appendChild(el("span", null, p[0]));
          grid.appendChild(card);
        });
        content.appendChild(grid);

        content.appendChild(el("h3", null, "Views per day"));
        var bars = el("div", "bars");
        var daily = d.daily || [];
        var max = daily.reduce(function (m, r) { return Math.max(m, r.views); }, 1);
        daily.forEach(function (r) {
          var bar = el("span");
          bar.style.height = Math.max(2, Math.round(r.views / max * 100)) + "%";
          bar.title = r.name + ": " + r.views;
          bars.appendChild(bar);
        });
        if (!daily.length) content.appendChild(el("p", "form-note", "No visits recorded yet."));
        else content.appendChild(bars);

        var lists = el("div", "an-grid");
        lists.appendChild(rankList("Top countries", d.countries || []));
        lists.appendChild(rankList("Top cities", d.cities || []));
        lists.appendChild(rankList("Most viewed pages", d.pages || []));
        lists.appendChild(rankList("Devices", d.devices || []));
        lists.appendChild(rankList("Traffic sources", d.sources || []));
        content.appendChild(lists);

        content.appendChild(el("h3", null, "Latest visits"));
        var table = el("table");
        table.appendChild(A.headRow(["Time", "Page", "Country", "City", "Device"]));
        var body = el("tbody");
        (res[1].data || []).forEach(function (row) {
          var tr = el("tr");
          [new Date(row.created_at).toLocaleString(), row.page, row.country || "\u2014", row.city || "\u2014", row.device || "\u2014"]
            .forEach(function (v) { tr.appendChild(A.cell(v)); });
          body.appendChild(tr);
        });
        table.appendChild(body);
        content.appendChild(A.wrap(table));
      });
    }
    return draw();
  }

  function csvCell(value) {
    var s = value === null || value === undefined ? "" : (typeof value === "object" ? JSON.stringify(value) : String(value));
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportTable(table, button) {
    button.disabled = true;
    client.from(table).select("*").order("created_at", { ascending: false }).limit(5000).then(function (r) {
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) { window.alert("Nothing to export yet."); return; }
      var cols = Object.keys(rows[0]);
      var lines = [cols.map(csvCell).join(",")].concat(rows.map(function (row) {
        return cols.map(function (c) { return csvCell(row[c]); }).join(",");
      }));
      var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = table + "-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }).catch(function (e) { window.alert(A.errorText(e)); })
      .then(function () { button.disabled = false; });
  }

  function renderExport(content) {
    content.textContent = "";
    content.appendChild(el("h2", null, "Export data"));
    content.appendChild(el("p", "form-note", "Download a CSV file (opens in Excel or Google Sheets). Up to 5,000 newest rows each."));
    var row = el("div", "row-actions");
    [["bookings", "Bookings"], ["customer_inquiries", "Customer inquiries"], ["page_views", "Visitor log"], ["conversations", "Conversations"]]
      .forEach(function (p) {
        var b = el("button", "btn btn-green", p[1]); b.type = "button";
        b.addEventListener("click", function () { exportTable(p[0], b); });
        row.appendChild(b);
      });
    content.appendChild(row);
    return Promise.resolve();
  }

  TABS.splice(1, 0, { id: "analytics", label: "Analytics", render: renderAnalytics });
  TABS.splice(TABS.length - 1, 0, { id: "export", label: "Export", render: renderExport });
  TABS.forEach(function (t) { if (ICONS[t.id]) t.icon = svg(ICONS[t.id]); });

  var badgeTabs = { bookings: ["bookings", [["status", "requested"]]], inquiries: ["customer_inquiries", [["status", "new"]]], unanswered: ["unanswered_questions", [["status", "open"]]] };

  function refreshBadges() {
    var ids = Object.keys(badgeTabs);
    return Promise.all(ids.map(function (id) { return A.count(badgeTabs[id][0], badgeTabs[id][1]).catch(function () { return 0; }); }))
      .then(function (counts) {
        ids.forEach(function (id, i) {
          var tab = TABS.filter(function (t) { return t.id === id; })[0];
          if (tab) tab.badge = counts[i] || 0;
        });
        A.showTab(A.current);
      });
  }

  var waiting = window.setInterval(function () {
    if (A.state.role) { window.clearInterval(waiting); refreshBadges().catch(function () {}); }
  }, 1500);
})();
