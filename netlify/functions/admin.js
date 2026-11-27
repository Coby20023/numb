// Admin API. Every request is checked on the server:
//   1. the bearer token must be a valid Supabase Auth session,
//   2. that user must have a row in admin_users (role owner or editor for writes; viewer is read-only),
//   3. only whitelisted tables and fields can be touched.
// Environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" },
  body: JSON.stringify(body)
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = ["about", "hiking", "safaris", "destinations", "tour_preparation", "bookings", "travel_information", "safety", "wildlife", "customer_support"];

// Field types: text (short), long (paragraph), int, enum:<values>, slug, timestamp, key
const TABLES = {
  packages: {
    write: true, order: "sort_order.asc,created_at.desc", del: true,
    fields: { title: "text", summary: "text", description: "long", duration: "text", price_text: "text", includes: "long", image_path: "image_path", status: "enum:draft,published", sort_order: "int" }
  },
  accommodation: {
    write: true, order: "sort_order.asc,created_at.desc", del: true,
    fields: { name: "text", location: "text", description: "long", price_text: "text", contact_note: "text", image_path: "image_path", status: "enum:draft,published", sort_order: "int" }
  },
  destinations: {
    write: true, order: "sort_order.asc,created_at.desc", del: true,
    fields: { name: "text", slug: "slug", summary: "text", description: "long", image_path: "image_path", status: "enum:draft,published", sort_order: "int" }
  },
  activities: {
    write: true, order: "sort_order.asc,created_at.desc", del: true,
    fields: { name: "text", slug: "slug", category: "text", summary: "text", description: "long", image_path: "image_path", status: "enum:draft,published", sort_order: "int" }
  },
  gallery_items: {
    write: true, order: "sort_order.asc,created_at.desc", del: true,
    fields: { title: "text", alt_text: "text", category: "text", image_path: "image_path", status: "enum:draft,published", sort_order: "int" }
  },
  website_content: {
    write: true, order: "content_key.asc", del: true,
    fields: { content_key: "enum:intro_title,intro_description,hero_eyebrow,contact_prompt", value: "long", status: "enum:draft,published" }
  },
  blog_posts: {
    write: true, order: "created_at.desc", del: true,
    fields: { slug: "slug", title: "text", excerpt: "text", body: "long", status: "enum:draft,published", published_at: "timestamp" }
  },
  faq_entries: {
    write: true, order: "created_at.desc", del: true,
    fields: { category: "enum:" + CATEGORIES.join(","), question: "text", answer: "long", status: "enum:draft,approved,retired" }
  },
  bookings: {
    write: true, order: "created_at.desc", del: false, // admins may update status and notes only
    fields: { status: "enum:requested,contacted,confirmed,paid,cancelled", internal_note: "long" }, readonly: ["full_name", "email", "phone", "activity", "destination", "tour_date", "participants", "message", "created_at"]
  },
  unanswered_questions: {
    write: true, order: "created_at.desc", del: false,
    fields: { status: "enum:open,escalated,answered,dismissed", admin_notes: "long" }, readonly: ["question", "created_at"]
  },
  site_settings: {
    write: true, order: "key.asc", del: false, idField: "key",
    fields: { value: "text" }, readonly: ["key"]
  },
  conversations: { write: false, order: "created_at.desc", del: false, fields: {} },
  messages: { write: false, order: "created_at.desc", del: false, fields: {} }
};

const SETTING_KEYS = ["business_email", "business_phone", "business_address", "whatsapp_number"];

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !service) throw new Error("Supabase not configured");
  return { url, service, anon };
}

function clean(value, max) {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

// Validate and normalise a field value. Returns { ok, value } or { ok: false, error }.
function checkField(name, type, raw) {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (type === "int") {
    const n = Number(raw);
    return Number.isInteger(n) && n >= -9999 && n <= 9999 ? { ok: true, value: n } : { ok: false, error: `${name}: whole number required` };
  }
  if (type.startsWith("enum:")) {
    const allowed = type.slice(5).split(",");
    return allowed.includes(raw) ? { ok: true, value: raw } : { ok: false, error: `${name}: invalid choice` };
  }
  if (type === "slug") {
    const s = clean(raw, 120);
    return /^[a-z0-9-]{3,120}$/.test(s) ? { ok: true, value: s } : { ok: false, error: "slug: lowercase letters, numbers and hyphens" };
  }
  if (type === "timestamp") {
    const d = new Date(raw);
    return isNaN(d) ? { ok: false, error: `${name}: invalid date` } : { ok: true, value: d.toISOString() };
  }
  if (type === "image_path") {
    const path = clean(raw, 300);
    return /^assets\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path || "") && !path.includes("..")
      ? { ok: true, value: path }
      : { ok: false, error: `${name}: use a file path inside assets/images/` };
  }
  const max = type === "long" ? 5000 : 300;
  const s = clean(String(raw), max);
  return s ? { ok: true, value: s } : { ok: false, error: `${name}: required text` };
}

function sanitiseBody(table, body, partial) {
  const cfg = TABLES[table];
  const out = {};
  for (const key of Object.keys(body || {})) {
    if (!(key in cfg.fields)) {
      return { error: `Field not allowed: ${key}` };
    }
    const res = checkField(key, cfg.fields[key], body[key]);
    if (!res.ok) return { error: res.error };
    out[key] = res.value;
  }
  if (!partial) {
    const required = {
      packages: ["title", "status"],
      accommodation: ["name", "status"],
      destinations: ["name", "slug", "status"],
      activities: ["name", "slug", "status"],
      gallery_items: ["title", "alt_text", "image_path", "status"],
      website_content: ["content_key", "value", "status"],
      blog_posts: ["slug", "title", "status"],
      faq_entries: ["category", "question", "answer", "status"]
    }[table];
    if (required) {
      for (const name of required) {
        if (!out[name]) return { error: `${name.replace(/_/g, " ")} required` };
      }
    }
  }
  if (partial) {
    const required = {
      packages: ["title", "status"],
      accommodation: ["name", "status"],
      destinations: ["name", "slug", "status"],
      activities: ["name", "slug", "status"],
      gallery_items: ["title", "alt_text", "image_path", "status"],
      website_content: ["content_key", "value", "status"],
      blog_posts: ["slug", "title", "status"],
      faq_entries: ["category", "question", "answer", "status"]
    }[table];
    if (required) {
      for (const name of required) {
        if (Object.prototype.hasOwnProperty.call(out, name) && !out[name]) {
          return { error: `${name.replace(/_/g, " ")} cannot be blank` };
        }
      }
    }
  }
  if (Object.keys(out).length === 0) return { error: "No changes supplied" };
  return { value: out };
}

async function sbFetch(path, opts = {}) {
  const { url, service } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const text = await res.text();
  return { data: text ? JSON.parse(text) : null, headers: res.headers };
}

// Confirm the bearer token belongs to a real admin. Returns { id, email, role } or null.
async function authenticate(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length > 4000) return null;
  const { url, service } = env();
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: service, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user || !user.id) return null;
  const { data } = await sbFetch(`admin_users?select=role&user_id=eq.${user.id}`);
  if (!data || !data.length) return null;
  return { id: user.id, email: user.email, role: data[0].role };
}

async function login(event) {
  const { url, anon } = env();
  if (!anon) return json(503, { error: "Sign-in is not configured." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }
  const email = clean(body.email, 200);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return json(400, { error: "Email and password are required." });

  // Rate-limit sign-in attempts per connection.
  const ip = (event.headers["x-nf-client-connection-ip"] || "unknown").slice(0, 64);
  const rl = await sbFetch("rpc/hit_rate_limit", {
    method: "POST", body: { p_key: `login:${ip}`, p_limit: 10, p_window_seconds: 900 }
  });
  if (rl.data === false) return json(429, { error: "Too many sign-in attempts. Please wait 15 minutes." });

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) return json(401, { error: "Email or password is incorrect." });
  const session = await res.json();
  return json(200, { access_token: session.access_token, expires_in: session.expires_in });
}

function canWrite(admin) { return admin.role === "owner" || admin.role === "editor"; }

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  try {
    if (q.action === "login") {
      if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
      return await login(event);
    }

    const admin = await authenticate(event);
    if (!admin) return json(401, { error: "Please sign in again." });

    if (q.action === "me") return json(200, { email: admin.email, role: admin.role });

    if (q.action === "analytics" && event.httpMethod === "GET") {
      const count = async (path) => {
        const r = await sbFetch(path, { prefer: "count=exact" });
        const range = r.headers.get("content-range") || "";
        return Number(range.split("/")[1]) || 0;
      };
      return json(200, {
        conversations: await count("conversations?select=id"),
        messages: await count("messages?select=id&role=eq.user"),
        unanswered_open: await count("unanswered_questions?select=id&status=eq.open"),
        bookings_requested: await count("bookings?select=id&status=eq.requested"),
        faq_approved: await count("faq_entries?select=id&status=eq.approved"),
        faq_draft: await count("faq_entries?select=id&status=eq.draft")
      });
    }

    if (q.action === "sync" && event.httpMethod === "GET") {
      const { data } = await sbFetch("instagram_sync_status?select=*&id=eq.1");
      return json(200, (data && data[0]) || {});
    }

    const table = q.table;
    if (!table || !Object.prototype.hasOwnProperty.call(TABLES, table)) return json(400, { error: "Unknown table" });
    const cfg = TABLES[table];
    const idField = cfg.idField || "id";

    if (event.httpMethod === "GET") {
      const { data } = await sbFetch(`${table}?select=*&order=${cfg.order}&limit=200`);
      return json(200, { rows: data || [], fields: cfg.fields, readonly: cfg.readonly || [] });
    }

    if (!cfg.write || !canWrite(admin)) return json(403, { error: "Your account cannot change this." });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }

    if (event.httpMethod === "POST") {
      if (table === "bookings" || table === "unanswered_questions") return json(405, { error: "Created by visitors only." });
      if (table === "site_settings") {
        if (!SETTING_KEYS.includes(body.key)) return json(400, { error: "Unknown setting" });
        const raw = typeof body.value === "string" ? body.value : "";
        const value = clean(raw, 300) || "";              // blank is allowed: the site hides empty values
        await sbFetch("site_settings?on_conflict=key", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
          body: { key: body.key, value, updated_at: new Date().toISOString() }
        });
        return json(200, { ok: true });
      }
      const v = sanitiseBody(table, body, false);
      if (v.error) return json(400, { error: v.error });
      if (table === "faq_entries" && v.value.status === "approved") {
        v.value.approved_by = admin.id;
        v.value.approved_at = new Date().toISOString();
      }
      const { data } = await sbFetch(table, { method: "POST", body: v.value, prefer: "return=representation" });
      return json(200, { ok: true, row: data && data[0] });
    }

    if (event.httpMethod === "PATCH") {
      const id = clean(q.id, 64);
      const idOk = idField === "key" ? SETTING_KEYS.includes(id) : UUID.test(id || "");
      if (!idOk) return json(400, { error: "Invalid id" });
      const updates = sanitiseBody(table, body, true);
      if (updates.error) return json(400, { error: updates.error });
      const patch = { ...updates.value };
      if (table === "faq_entries" && patch.status === "approved") {
        patch.approved_by = admin.id;
        patch.approved_at = new Date().toISOString();
      }
      if (table !== "site_settings") patch.updated_at = new Date().toISOString();
      await sbFetch(`${table}?${idField}=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", body: patch, prefer: "return=minimal"
      });
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      if (!cfg.del) return json(405, { error: "Deletion is not allowed here." });
      if (admin.role !== "owner") return json(403, { error: "Only the owner can delete content." });
      const id = clean(q.id, 64);
      if (!UUID.test(id || "")) return json(400, { error: "Invalid id" });
      await sbFetch(`${table}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      console.log(`admin ${admin.email} deleted ${table}/${id}`);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("admin error:", err.message);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
