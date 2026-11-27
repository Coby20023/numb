// Public, read-only. Returns only PUBLISHED content and public settings.
// GET /api/content?type=packages | accommodation | blog | blog&slug=<slug> | settings

const json = (statusCode, body, cache = 300) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=${cache}, stale-while-revalidate=900`,
    "X-Content-Type-Options": "nosniff"
  },
  body: JSON.stringify(body)
});

const SLUG = /^[a-z0-9-]{3,120}$/;

const SELECTS = {
  packages: "id,title,summary,description,duration,price_text,includes,sort_order",
  accommodation: "id,name,location,description,price_text,contact_note,sort_order",
  blog: "slug,title,excerpt,published_at",
  blogPost: "slug,title,excerpt,body,published_at"
};

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, 0);

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(200, { status: "not_configured", items: [] }, 60);

  const q = event.queryStringParameters || {};
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Read failed: ${res.status}`);
    return res.json();
  };

  try {
    if (q.type === "packages") {
      const items = await get(`packages?select=${SELECTS.packages}&status=eq.published&order=sort_order.asc,created_at.desc&limit=100`);
      return json(200, { status: "ok", items });
    }
    if (q.type === "accommodation") {
      const items = await get(`accommodation?select=${SELECTS.accommodation}&status=eq.published&order=sort_order.asc,created_at.desc&limit=100`);
      return json(200, { status: "ok", items });
    }
    if (q.type === "blog" && q.slug) {
      if (!SLUG.test(q.slug)) return json(400, { error: "Invalid article" }, 0);
      const rows = await get(`blog_posts?select=${SELECTS.blogPost}&slug=eq.${q.slug}&status=eq.published&limit=1`);
      if (!rows.length) return json(404, { error: "Not found" }, 60);
      return json(200, { status: "ok", item: rows[0] });
    }
    if (q.type === "blog") {
      const items = await get(`blog_posts?select=${SELECTS.blog}&status=eq.published&order=published_at.desc.nullslast&limit=50`);
      return json(200, { status: "ok", items });
    }
    if (q.type === "settings") {
      const rows = await get("site_settings?select=key,value&key=in.(business_email,business_phone,business_address,whatsapp_number)");
      const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return json(200, { status: "ok", settings }, 600);
    }
    return json(400, { error: "Unknown content type" }, 0);
  } catch (err) {
    console.error("content read error:", err.message);
    return json(200, { status: "error", items: [] }, 30);
  }
};
