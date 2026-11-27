/* Supabase Auth and RLS-protected admin tools for the static site. */
(function () {
  "use strict";

  var client = window.moyendaSupabase;
  var state = { role: null, email: null };
  var storageBucket = "moyenda-gallery";
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function errorText(error) {
    return error && error.message ? error.message : "The request failed.";
  }

  function showLogin(message) {
    state.role = null;
    state.email = null;
    $("app-view").classList.add("hidden");
    $("login-view").classList.remove("hidden");
    $("login-msg").textContent = message || "";
  }

  function showApp(user, role) {
    state.role = role;
    state.email = user.email || "";
    $("who").textContent = state.email + " \u00B7 " + role;
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    showTab("overview");
  }

  function verifyAdmin(session) {
    if (!session || !session.user) return Promise.reject(new Error("Please sign in again."));
    return client.from("admin_users").select("role")
      .eq("user_id", session.user.id).maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (!result.data || ["owner", "editor", "viewer"].indexOf(result.data.role) === -1) {
          return client.auth.signOut().then(function () {
            throw new Error("This Supabase account does not have an approved admin role.");
          });
        }
        showApp(session.user, result.data.role);
      });
  }

  $("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var email = form.elements.namedItem("email").value.trim();
    var password = form.elements.namedItem("password").value;
    $("login-msg").textContent = "";
    if (!client) {
      $("login-msg").textContent = window.moyendaSupabaseConfigError ?
        errorText(window.moyendaSupabaseConfigError) :
        "Supabase is not configured. Set the project URL and public key in assets/js/app.js.";
      return;
    }
    button.disabled = true;
    client.auth.signInWithPassword({ email: email, password: password })
      .then(function (result) {
        if (result.error) throw result.error;
        form.elements.namedItem("password").value = "";
        return verifyAdmin(result.data.session);
      })
      .catch(function (error) {
        $("login-msg").textContent = errorText(error);
      })
      .then(function () { button.disabled = false; });
  });

  $("logout").addEventListener("click", function () {
    if (!client) return showLogin("Supabase is not configured.");
    client.auth.signOut().then(function (result) {
      if (result.error) throw result.error;
      showLogin("You have signed out.");
    }).catch(function (error) {
      $("content").prepend(el("p", "admin-msg err", "Sign-out failed: " + errorText(error)));
    });
  });

  var SPECS = {
    packages: {
      label: "Package",
      columns: ["title", "duration", "price_text", "status"],
      fields: { title: "text", summary: "long", description: "long", duration: "text", price_text: "text", includes: "long", image_path: "text", status: "enum:draft,published", sort_order: "int" },
      order: "sort_order"
    },
    accommodation: {
      label: "Accommodation",
      columns: ["name", "location", "price_text", "status"],
      fields: { name: "text", location: "text", description: "long", price_text: "text", contact_note: "text", image_path: "text", status: "enum:draft,published", sort_order: "int" },
      order: "sort_order"
    },
    destinations: {
      label: "Destination",
      columns: ["name", "slug", "image_path", "status"],
      fields: { name: "text", slug: "text", summary: "long", description: "long", image_path: "text", status: "enum:draft,published", sort_order: "int" },
      order: "sort_order"
    },
    activities: {
      label: "Activity",
      columns: ["name", "slug", "category", "status"],
      fields: { name: "text", slug: "text", category: "text", summary: "long", description: "long", image_path: "text", status: "enum:draft,published", sort_order: "int" },
      order: "sort_order"
    },
    gallery_items: {
      label: "Gallery item",
      columns: ["title", "image_path", "category", "status"],
      fields: { title: "text", alt_text: "text", category: "text", image_path: "text", status: "enum:draft,published", sort_order: "int" },
      order: "sort_order",
      gallery: true
    },
    website_content: {
      label: "Homepage text",
      columns: ["content_key", "status"],
      fields: { content_key: "enum:intro_title,intro_description,hero_eyebrow,contact_prompt", value: "long", status: "enum:draft,published" },
      order: "created_at"
    },
    blog_posts: {
      label: "Blog post",
      columns: ["title", "slug", "status", "published_at"],
      fields: { title: "text", slug: "text", excerpt: "long", body: "long", status: "enum:draft,published", published_at: "timestamp" },
      order: "created_at"
    },
    faq_entries: {
      label: "FAQ entry",
      columns: ["question", "category", "status"],
      fields: { category: "enum:about,hiking,safaris,destinations,tour_preparation,bookings,travel_information,safety,wildlife,customer_support", question: "long", answer: "long", status: "enum:draft,approved,retired" },
      order: "created_at"
    }
  };

  var TABS = [
    { id: "overview", label: "Overview", render: renderOverview },
    { id: "bookings", label: "Bookings", render: renderBookings },
    { id: "inquiries", label: "Customer inquiries", render: renderInquiries },
    { id: "packages", label: "Packages", render: function (c) { return renderContent(c, "packages"); } },
    { id: "accommodation", label: "Accommodation", render: function (c) { return renderContent(c, "accommodation"); } },
    { id: "destinations", label: "Destinations", render: function (c) { return renderContent(c, "destinations"); } },
    { id: "activities", label: "Activities", render: function (c) { return renderContent(c, "activities"); } },
    { id: "gallery", label: "Gallery", render: function (c) { return renderContent(c, "gallery_items"); } },
    { id: "website-content", label: "Website content", render: function (c) { return renderContent(c, "website_content"); } },
    { id: "blog", label: "Blog", render: function (c) { return renderContent(c, "blog_posts"); } },
    { id: "faq", label: "FAQ approval", render: function (c) { return renderContent(c, "faq_entries"); } },
    { id: "unanswered", label: "Unanswered", render: renderUnanswered },
    { id: "conversations", label: "Conversations", render: renderConversations },
    { id: "sync", label: "Instagram", render: renderSync },
    { id: "settings", label: "Business settings", render: renderSettings }
  ];

  function showTab(id) {
    var tab = TABS.filter(function (item) { return item.id === id; })[0] || TABS[0];
    var nav = $("tabs");
    nav.textContent = "";
    TABS.forEach(function (item) {
      var button = el("button", item.id === tab.id ? "active" : "", item.label);
      button.type = "button";
      button.setAttribute("aria-current", item.id === tab.id ? "page" : "false");
      button.addEventListener("click", function () { showTab(item.id); });
      nav.appendChild(button);
    });
    var content = $("content");
    content.textContent = "Loading...";
    Promise.resolve(tab.render(content)).catch(function (error) {
      content.textContent = "";
      content.appendChild(el("p", "admin-msg err", "Could not load this section: " + errorText(error)));
    });
  }

  function count(table, filters) {
    var query = client.from(table).select("id", { count: "exact", head: true });
    (filters || []).forEach(function (filter) { query = query.eq(filter[0], filter[1]); });
    return query.then(function (result) {
      if (result.error) throw result.error;
      return result.count || 0;
    });
  }

  function renderOverview(content) {
    return Promise.all([
      count("conversations"),
      count("messages", [["role", "user"]]),
      count("unanswered_questions", [["status", "open"]]),
      count("bookings", [["status", "requested"]]),
      count("customer_inquiries", [["status", "new"]]),
      count("faq_entries", [["status", "approved"]]),
      count("faq_entries", [["status", "draft"]])
    ]).then(function (values) {
      content.textContent = "";
      content.appendChild(el("h2", null, "Overview"));
      var grid = el("div", "stat-grid");
      [
        ["Conversations", values[0]],
        ["Visitor questions", values[1]],
        ["Open unanswered questions", values[2]],
        ["Booking requests", values[3]],
        ["New customer inquiries", values[4]],
        ["Approved FAQ entries", values[5]],
        ["FAQ drafts", values[6]]
      ].forEach(function (pair) {
        var card = el("div", "stat");
        card.appendChild(el("strong", null, String(pair[1])));
        card.appendChild(el("span", null, pair[0]));
        grid.appendChild(card);
      });
      content.appendChild(grid);
    });
  }

  function fetchRows(table, order) {
    var query = client.from(table).select("*");
    if (order) query = query.order(order, { ascending: order === "sort_order" });
    else query = query.order("created_at", { ascending: false });
    return query.limit(300).then(function (result) {
      if (result.error) throw result.error;
      return result.data || [];
    });
  }

  function renderBookings(content) {
    return fetchRows("bookings").then(function (rows) {
      content.textContent = "";
      content.appendChild(el("h2", null, "Booking requests"));
      content.appendChild(el("p", "form-note", "A request is not confirmed until the team has agreed the details with the visitor."));
      if (!rows.length) return content.appendChild(el("p", null, "No booking requests yet."));
      var table = el("table");
      table.appendChild(headRow(["Received", "Name", "Contact", "Activity / destination", "Date / people", "Status", "Internal note", ""]));
      var body = el("tbody");
      rows.forEach(function (row) {
        var tr = el("tr");
        tr.appendChild(cell(new Date(row.created_at).toLocaleString()));
        tr.appendChild(cell(row.full_name));
        tr.appendChild(cell(row.email + " \u00B7 " + row.phone));
        tr.appendChild(cell((row.activity || "") + (row.destination ? " / " + row.destination : "")));
        tr.appendChild(cell((row.tour_date || "Flexible") + " \u00B7 " + row.participants + " people"));
        var status = statusSelect(["requested", "contacted", "confirmed", "paid", "cancelled"], row.status);
        status.disabled = !canWrite();
        var statusCell = el("td"); statusCell.appendChild(status); tr.appendChild(statusCell);
        var note = el("input"); note.type = "text"; note.value = row.internal_note || ""; note.maxLength = 2000; note.disabled = !canWrite();
        var noteCell = el("td"); noteCell.appendChild(note); tr.appendChild(noteCell);
        var save = el("button", "mini", "Save"); save.type = "button"; save.hidden = !canWrite();
        save.addEventListener("click", function () {
          patch("bookings", row.id, { status: status.value, internal_note: note.value || null }, save);
        });
        var actionCell = el("td"); actionCell.appendChild(save); tr.appendChild(actionCell);
        body.appendChild(tr);
      });
      table.appendChild(body);
      content.appendChild(wrap(table));
    });
  }

  function renderInquiries(content) {
    return fetchRows("customer_inquiries").then(function (rows) {
      content.textContent = "";
      content.appendChild(el("h2", null, "Customer inquiries"));
      if (!rows.length) return content.appendChild(el("p", null, "No customer inquiries yet."));
      var table = el("table");
      table.appendChild(headRow(["Received", "Name", "Contact", "Subject", "Message", "Status", "Internal note", ""]));
      var body = el("tbody");
      rows.forEach(function (row) {
        var tr = el("tr");
        tr.appendChild(cell(new Date(row.created_at).toLocaleString()));
        tr.appendChild(cell(row.name));
        tr.appendChild(cell(row.email + (row.phone ? " \u00B7 " + row.phone : "")));
        tr.appendChild(cell(row.subject));
        tr.appendChild(cell(row.message));
        var status = statusSelect(["new", "replied", "closed"], row.status);
        status.disabled = !canWrite();
        var statusCell = el("td"); statusCell.appendChild(status); tr.appendChild(statusCell);
        var note = el("input"); note.type = "text"; note.value = row.internal_note || ""; note.maxLength = 2000; note.disabled = !canWrite();
        var noteCell = el("td"); noteCell.appendChild(note); tr.appendChild(noteCell);
        var save = el("button", "mini", "Save"); save.type = "button"; save.hidden = !canWrite();
        save.addEventListener("click", function () {
          patch("customer_inquiries", row.id, { status: status.value, internal_note: note.value || null }, save);
        });
        var actionCell = el("td"); actionCell.appendChild(save); tr.appendChild(actionCell);
        body.appendChild(tr);
      });
      table.appendChild(body);
      content.appendChild(wrap(table));
    });
  }

  function renderContent(content, tableName) {
    var spec = SPECS[tableName];
    return fetchRows(tableName, spec.order).then(function (rows) {
      content.textContent = "";
      var header = el("div", "row-actions");
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.appendChild(el("h2", null, spec.label + "s"));
      if (canWrite()) {
        var add = el("button", "btn btn-green", "New " + spec.label.toLowerCase());
        add.type = "button";
        add.addEventListener("click", function () { editor(content, tableName, null); });
        header.appendChild(add);
      }
      content.appendChild(header);
      if (!rows.length) {
        content.appendChild(el("p", null, "Nothing here yet."));
        return;
      }
      var table = el("table");
      table.appendChild(headRow(spec.columns.concat(["Actions"])));
      var body = el("tbody");
      rows.forEach(function (row) {
        var tr = el("tr");
        spec.columns.forEach(function (column) {
          var value = row[column];
          tr.appendChild(cell(value === null || value === undefined || value === "" ?
            "\u2014" : (column.indexOf("_at") !== -1 ? new Date(value).toLocaleDateString() : String(value))));
        });
        var actions = el("div", "row-actions");
        if (canWrite()) {
          var edit = el("button", "mini", "Edit"); edit.type = "button";
          edit.addEventListener("click", function () { editor(content, tableName, row); });
          actions.appendChild(edit);
        }
        if (state.role === "owner") {
          var remove = el("button", "mini danger", "Delete"); remove.type = "button";
          remove.addEventListener("click", function () { deleteRow(tableName, row); });
          actions.appendChild(remove);
        }
        var actionCell = el("td"); actionCell.appendChild(actions); tr.appendChild(actionCell);
        body.appendChild(tr);
      });
      table.appendChild(body);
      content.appendChild(wrap(table));
    });
  }

  function editor(content, tableName, row) {
    var spec = SPECS[tableName];
    content.textContent = "";
    content.appendChild(el("h2", null, (row ? "Edit " : "New ") + spec.label.toLowerCase()));
    var form = el("form", "admin-form");
    var grid = el("div", "field-grid");
    Object.keys(spec.fields).forEach(function (name) {
      var type = spec.fields[name];
      var label = el("label", type === "long" ? "full" : "");
      label.appendChild(document.createTextNode(name.replace(/_/g, " ")));
      var input;
      var value = row && row[name] !== null && row[name] !== undefined ? row[name] : "";
      if (type === "long") {
        input = el("textarea");
        input.value = value;
        var limits = {
          body: 30000, description: 5000, answer: 4000, value: 5000, summary: 400,
          excerpt: 400, question: 400, includes: 2000
        };
        input.maxLength = limits[name] || 2000;
      } else if (type.indexOf("enum:") === 0) {
        input = el("select");
        type.slice(5).split(",").forEach(function (option) {
          var optionNode = el("option", null, option);
          optionNode.value = option;
          if (option === value) optionNode.selected = true;
          input.appendChild(optionNode);
        });
      } else if (type === "int") {
        input = el("input"); input.type = "number"; input.value = value === "" ? "0" : value;
      } else if (type === "timestamp") {
        input = el("input"); input.type = "datetime-local"; input.value = value ? toLocalInput(value) : "";
      } else {
        input = el("input"); input.type = "text"; input.value = value;
        input.maxLength = name === "slug" ? 120 : (name === "title" ? 200 : 300);
      }
      input.name = name;
      if (["title", "name", "slug", "content_key", "value", "question", "answer", "alt_text"].indexOf(name) !== -1) input.required = true;
      label.appendChild(input);
      grid.appendChild(label);
    });
    if (spec.gallery) {
      var fileLabel = el("label", "full");
      fileLabel.appendChild(document.createTextNode("Upload gallery image (JPEG, PNG, WebP or AVIF; max 5 MB)"));
      var file = el("input"); file.type = "file"; file.name = "image_file"; file.accept = "image/jpeg,image/png,image/webp,image/avif";
      fileLabel.appendChild(file);
      grid.appendChild(fileLabel);
      if (row && row.storage_path) content.appendChild(el("p", "form-note", "Current Storage image: " + row.storage_path));
    }
    form.appendChild(grid);
    var message = el("div", "admin-msg");
    var save = el("button", "btn btn-gold", "Save"); save.type = "submit"; save.style.marginTop = "18px";
    var cancel = el("button", "mini", "Cancel"); cancel.type = "button"; cancel.style.marginLeft = "10px";
    cancel.addEventListener("click", function () { showTab(currentTab(tableName)); });
    form.appendChild(save); form.appendChild(cancel); form.appendChild(message);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var body = {};
      Object.keys(spec.fields).forEach(function (name) {
        var input = form.elements.namedItem(name);
        var value = input.value.trim();
        if (spec.fields[name] === "int") body[name] = value === "" ? 0 : Number(value);
        else if (spec.fields[name] === "timestamp") body[name] = value ? new Date(value).toISOString() : null;
        else body[name] = value === "" ? null : value;
      });
      if (tableName === "blog_posts" && body.status === "published" && !body.published_at) body.published_at = new Date().toISOString();
      if (row && Object.prototype.hasOwnProperty.call(row, "updated_at")) body.updated_at = new Date().toISOString();
      save.disabled = true;
      saveRecord(tableName, row, body, form.elements.namedItem("image_file"))
        .then(function () { showTab(currentTab(tableName)); })
        .catch(function (error) {
          message.className = "admin-msg err";
          message.textContent = errorText(error);
          save.disabled = false;
        });
    });
    content.appendChild(form);
  }

  function saveRecord(tableName, row, body, imageInput) {
    var upload = Promise.resolve(null);
    if (tableName === "gallery_items") {
      var file = imageInput.files && imageInput.files[0];
      if (file) {
        if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
          return Promise.reject(new Error("Choose a JPEG, PNG, WebP or AVIF image smaller than 5 MB."));
        }
        var safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(-100);
        var path = row && row.storage_path ? row.storage_path :
          Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "-" + safeName;
        upload = client.storage.from(storageBucket).upload(path, file, {
          cacheControl: "3600", upsert: Boolean(row && row.storage_path), contentType: file.type
        }).then(function (result) {
          if (result.error) throw result.error;
          body.image_path = null;
          body.storage_path = result.data.path;
        });
      } else {
        body.image_path = body.image_path || (row && row.image_path) || null;
        body.storage_path = body.image_path ? null : ((row && row.storage_path) || null);
      }
      if (!body.image_path && !body.storage_path) return Promise.reject(new Error("Choose a gallery image or enter an existing assets/images/ path."));
    }
    return upload.then(function () {
      var query = row ? client.from(tableName).update(body).eq("id", row.id) : client.from(tableName).insert(body);
      return query.then(function (result) {
        if (result.error) throw result.error;
      });
    });
  }

  function deleteRow(tableName, row) {
    var spec = SPECS[tableName];
    if (!window.confirm("Delete this " + spec.label.toLowerCase() + " permanently?")) return;
    client.from(tableName).delete().eq("id", row.id).then(function (result) {
      if (result.error) throw result.error;
      if (tableName === "gallery_items" && row.storage_path) {
        return client.storage.from(storageBucket).remove([row.storage_path]).then(function (storageResult) {
          if (storageResult.error) throw new Error("The record was deleted, but its Storage image could not be removed: " + errorText(storageResult.error));
        });
      }
    }).then(function () {
      showTab(currentTab(tableName));
    }).catch(function (error) {
      window.alert(errorText(error));
    });
  }

  function renderUnanswered(content) {
    return fetchRows("unanswered_questions").then(function (rows) {
      content.textContent = "";
      content.appendChild(el("h2", null, "Unanswered questions"));
      content.appendChild(el("p", "form-note", "Questions escalated by the optional AI guide. Add a verified FAQ entry, then mark the question answered."));
      if (!rows.length) return content.appendChild(el("p", null, "No unanswered questions yet."));
      var table = el("table");
      table.appendChild(headRow(["Received", "Question", "Status", "Internal note", ""]));
      var body = el("tbody");
      rows.forEach(function (row) {
        var tr = el("tr");
        tr.appendChild(cell(new Date(row.created_at).toLocaleString()));
        tr.appendChild(cell(row.question));
        var status = statusSelect(["open", "escalated", "answered", "dismissed"], row.status);
        status.disabled = !canWrite();
        var statusCell = el("td"); statusCell.appendChild(status); tr.appendChild(statusCell);
        var note = el("input"); note.type = "text"; note.value = row.admin_notes || ""; note.maxLength = 2000; note.disabled = !canWrite();
        var noteCell = el("td"); noteCell.appendChild(note); tr.appendChild(noteCell);
        var save = el("button", "mini", "Save"); save.type = "button"; save.hidden = !canWrite();
        save.addEventListener("click", function () { patch("unanswered_questions", row.id, { status: status.value, admin_notes: note.value || null }, save); });
        var actionCell = el("td"); actionCell.appendChild(save); tr.appendChild(actionCell);
        body.appendChild(tr);
      });
      table.appendChild(body);
      content.appendChild(wrap(table));
    });
  }

  function renderConversations(content) {
    return fetchRows("conversations").then(function (rows) {
      content.textContent = "";
      content.appendChild(el("h2", null, "Conversations"));
      content.appendChild(el("p", "form-note", "Most recent first. Message text remains restricted to authenticated administrators."));
      if (!rows.length) return content.appendChild(el("p", null, "No conversations yet."));
      var table = el("table");
      table.appendChild(headRow(["Started", "Page", "Conversation ID"]));
      var body = el("tbody");
      rows.slice(0, 100).forEach(function (row) {
        var tr = el("tr");
        tr.appendChild(cell(new Date(row.created_at).toLocaleString()));
        tr.appendChild(cell(row.page_path || "\u2014"));
        tr.appendChild(cell(row.id));
        body.appendChild(tr);
      });
      table.appendChild(body);
      content.appendChild(wrap(table));
    });
  }

  function renderSync(content) {
    return client.from("instagram_sync_status").select("*").eq("id", 1).maybeSingle().then(function (result) {
      if (result.error) throw result.error;
      var status = result.data || {};
      content.textContent = "";
      content.appendChild(el("h2", null, "Instagram synchronisation"));
      var rows = [
        ["Token status", status.token_status || "unknown"],
        ["Last successful sync", status.last_success_at ? new Date(status.last_success_at).toLocaleString() : "Not yet"],
        ["Last attempt", status.last_attempt_at ? new Date(status.last_attempt_at).toLocaleString() : "Not yet"],
        ["Posts stored", String(status.posts_stored || 0)],
        ["Last error", status.last_error ? (status.last_error_code ? "Code " + status.last_error_code + ": " : "") + status.last_error : "None"]
      ];
      var table = el("table"); var body = el("tbody");
      rows.forEach(function (pair) {
        var tr = el("tr"); tr.appendChild(cell(pair[0])); tr.appendChild(cell(pair[1])); body.appendChild(tr);
      });
      table.appendChild(body); content.appendChild(wrap(table));
      if (status.token_status === "expired") content.appendChild(el("p", "admin-msg err", "The Instagram access token has expired. Renew it in Meta and update the optional sync service."));
    });
  }

  function renderSettings(content) {
    return client.from("site_settings").select("key,value").then(function (result) {
      if (result.error) throw result.error;
      content.textContent = "";
      content.appendChild(el("h2", null, "Business settings"));
      content.appendChild(el("p", "form-note", "These values are public on the website. Do not enter passwords, tokens or other secrets."));
      var current = {};
      (result.data || []).forEach(function (row) { current[row.key] = row.value; });
      var form = el("form", "admin-form");
      var grid = el("div", "field-grid");
      var keys = [["business_email", "Business email"], ["business_phone", "Phone"], ["business_address", "Address / location"], ["whatsapp_number", "WhatsApp number (digits only)"]];
      keys.forEach(function (pair) {
        var label = el("label", pair[0] === "business_address" ? "full" : "");
        label.appendChild(document.createTextNode(pair[1]));
        var input = el("input"); input.name = pair[0]; input.value = current[pair[0]] || ""; input.maxLength = 300;
        label.appendChild(input); grid.appendChild(label);
      });
      form.appendChild(grid);
      var message = el("div", "admin-msg");
      var save = el("button", "btn btn-gold", "Save settings"); save.type = "submit"; save.style.marginTop = "18px"; save.disabled = !canWrite();
      form.appendChild(save); form.appendChild(message);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        save.disabled = true;
        Promise.all(keys.map(function (pair) {
          return client.from("site_settings").upsert({
            key: pair[0], value: form.elements.namedItem(pair[0]).value.trim(), updated_at: new Date().toISOString()
          }, { onConflict: "key" }).then(function (response) {
            if (response.error) throw response.error;
          });
        })).then(function () {
          message.className = "admin-msg ok"; message.textContent = "Settings saved.";
        }).catch(function (error) {
          message.className = "admin-msg err"; message.textContent = errorText(error);
        }).then(function () { save.disabled = !canWrite(); });
      });
      content.appendChild(form);
    });
  }

  function patch(table, id, body, button) {
    button.disabled = true;
    if (Object.prototype.hasOwnProperty.call(body, "updated_at")) body.updated_at = new Date().toISOString();
    client.from(table).update(body).eq("id", id).then(function (result) {
      if (result.error) throw result.error;
      button.textContent = "Saved";
      window.setTimeout(function () { button.textContent = "Save"; button.disabled = false; }, 1200);
    }).catch(function (error) {
      window.alert(errorText(error));
      button.disabled = false;
    });
  }

  function canWrite() {
    return state.role === "owner" || state.role === "editor";
  }

  function currentTab(table) {
    var map = {
      packages: "packages", accommodation: "accommodation", destinations: "destinations",
      activities: "activities", gallery_items: "gallery", website_content: "website-content",
      blog_posts: "blog", faq_entries: "faq"
    };
    return map[table] || "overview";
  }

  function statusSelect(options, value) {
    var select = el("select");
    options.forEach(function (option) {
      var node = el("option", null, option); node.value = option; node.selected = option === value;
      select.appendChild(node);
    });
    return select;
  }

  function headRow(labels) {
    var row = el("tr");
    labels.forEach(function (label) { row.appendChild(el("th", null, label)); });
    var head = el("thead"); head.appendChild(row);
    return head;
  }

  function cell(value) {
    return el("td", null, value === null || value === undefined ? "" : String(value));
  }

  function wrap(node) {
    var wrapper = el("div", "table-wrap");
    wrapper.style.overflowX = "auto";
    wrapper.appendChild(node);
    return wrapper;
  }

  function toLocalInput(value) {
    var date = new Date(value);
    if (isNaN(date)) return "";
    var pad = function (number) { return (number < 10 ? "0" : "") + number; };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  if (!client) {
    $("login-msg").textContent = window.moyendaSupabaseConfigError ?
      errorText(window.moyendaSupabaseConfigError) :
      "Supabase is not configured. Set the project URL and public key in assets/js/app.js.";
  } else {
    client.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        showLogin("Your Supabase session has ended. Please sign in again.");
      } else if (event === "TOKEN_REFRESHED" && session) {
        window.setTimeout(function () {
          verifyAdmin(session).catch(function () {
            showLogin("Your admin access could not be verified. Please sign in again.");
          });
        }, 0);
      }
    });
    client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      if (result.data.session) return verifyAdmin(result.data.session);
    }).catch(function (error) {
      showLogin("Could not verify your session: " + errorText(error));
    });
  }
})();
