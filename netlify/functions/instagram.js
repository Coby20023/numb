// Public, read-only. Serves cached Instagram posts from Supabase, never calls Instagram directly.
// GET /api/instagram?page=1&limit=12
// Returns the connection state too, so the page can show a setup message instead of fake posts.

const PAGE_SIZE_MAX = 24;

const json = (statusCode, body, cacheSeconds = 300) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=${cacheSeconds}, stale-while-revalidate=900`,
    "X-Content-Type-Options": "nosniff"
  },
  body: JSON.stringify(body)
});

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, 0);

  const configured = Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.INSTAGRAM_ACCESS_TOKEN);
  const q = event.queryStringParameters || {};
  const page = clampInt(q.page, 1, 1, 1000);
  const limit = clampInt(q.limit, 12, 1, PAGE_SIZE_MAX);
  const offset = (page - 1) * limit;

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return json(200, { status: configured ? "error" : "not_configured", items: [], hasMore: false }, 60);
  }

  try {
    // Fetch one extra row to know whether another page exists.
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const [mediaRes, statusRes] = await Promise.all([
      fetch(`${url}/rest/v1/instagram_media?select=id,media_type,caption,media_url,thumbnail_url,permalink,posted_at` +
        `&order=posted_at.desc&limit=${limit + 1}&offset=${offset}`, { headers }),
      fetch(`${url}/rest/v1/instagram_sync_status?select=token_status,last_success_at,posts_stored&id=eq.1`, { headers })
    ]);
    if (!mediaRes.ok) throw new Error(`Read failed: ${mediaRes.status}`);

    const rows = await mediaRes.json();
    const statusRows = statusRes.ok ? await statusRes.json() : [];
    const status = statusRows[0] || {};

    let state = "ok";
    if (!configured) state = "not_configured";
    else if (status.token_status === "expired") state = "token_expired";
    else if (!status.last_success_at && rows.length === 0) state = "pending";

    const hasMore = rows.length > limit;
    return json(200, {
      status: state,
      lastSyncedAt: status.last_success_at || null,
      items: rows.slice(0, limit),
      page,
      hasMore
    });
  } catch (err) {
    console.error("instagram read error:", err.message);
    return json(200, { status: "error", items: [], hasMore: false }, 30);
  }
};
