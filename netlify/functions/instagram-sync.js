// Instagram synchronisation via the official Meta Graph API.
// Runs on a schedule (every 30 minutes, see netlify.toml). It can also be triggered manually
// with a POST to /api/instagram-sync that carries the header x-sync-secret: <SYNC_SECRET>.
// Never scrapes Instagram. Access tokens never leave the server.
//
// Environment variables:
//   INSTAGRAM_ACCOUNT_ID       Instagram professional account ID (Business or Creator)
//   INSTAGRAM_ACCESS_TOKEN     long-lived token with the required Instagram permissions
//   INSTAGRAM_GRAPH_VERSION    optional, default v21.0 (check Meta's current version)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   SYNC_SECRET                required only for manual (HTTP) triggers

const MAX_PAGES = 4;          // up to 4 x 50 = 200 most recent posts per run
const PAGE_SIZE = 50;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

function supabase() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const base = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    upsertMedia: (rows) => fetch(`${url}/rest/v1/instagram_media?on_conflict=id`, {
      method: "POST",
      headers: { ...base, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    }),
    updateStatus: (fields) => fetch(`${url}/rest/v1/instagram_sync_status?id=eq.1`, {
      method: "PATCH",
      headers: { ...base, Prefer: "return=minimal" },
      body: JSON.stringify(fields)
    })
  };
}

// Graph API media fields. Carousel children give the first image or video of an album.
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp," +
  "children{media_type,media_url,thumbnail_url}";

async function fetchAllMedia(accountId, token, version) {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(PAGE_SIZE), access_token: token });
  let url = `https://graph.facebook.com/${version}/${accountId}/media?${params}`;
  const items = [];
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error((data.error && data.error.message) || `Graph API ${res.status}`);
      err.code = data.error && data.error.code;
      throw err;
    }
    items.push(...(data.data || []));
    url = data.paging && data.paging.next ? data.paging.next : null;
  }
  return items;
}

function toRow(item) {
  const child = item.children && item.children.data && item.children.data[0];
  const isVideo = item.media_type === "VIDEO";
  return {
    id: String(item.id),
    media_type: item.media_type,
    caption: item.caption ? String(item.caption).slice(0, 5000) : null,
    media_url: item.media_url || (child && child.media_url) || null,
    thumbnail_url: item.thumbnail_url || (child && child.thumbnail_url) || (isVideo ? null : item.media_url) || null,
    permalink: item.permalink,
    posted_at: item.timestamp
  };
}

async function runSync() {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const version = process.env.INSTAGRAM_GRAPH_VERSION || "v21.0";
  const db = supabase();

  if (!accountId || !token) {
    return { status: "not_configured", message: "Instagram is not connected yet." };
  }

  const now = new Date().toISOString();
  try {
    const items = await fetchAllMedia(accountId, token, version);
    const rows = items.filter((i) => i.permalink && i.timestamp).map(toRow);

    if (db && rows.length) {
      const res = await db.upsertMedia(rows);
      if (!res.ok) throw new Error(`Database write failed: ${res.status}`);
    }
    if (db) {
      await db.updateStatus({
        last_attempt_at: now, last_success_at: now, last_error: null, last_error_code: null,
        posts_stored: rows.length, token_status: "ok"
      });
    }
    return { status: "ok", synced: rows.length };
  } catch (err) {
    const expired = err.code === 190;
    console.error("instagram-sync error:", err.code || "", err.message);
    if (db) {
      await db.updateStatus({
        last_attempt_at: now,
        last_error: String(err.message).slice(0, 500),
        last_error_code: err.code || null,
        token_status: expired ? "expired" : "error"
      });
    }
    return { status: expired ? "token_expired" : "error", message: "Instagram sync failed. The site shows the last saved posts." };
  }
}

exports.handler = async (event) => {
  // HTTP calls (manual trigger) must present the secret. Scheduled runs have no httpMethod.
  if (event.httpMethod) {
    const secret = process.env.SYNC_SECRET;
    if (!secret || event.headers["x-sync-secret"] !== secret) {
      return json(401, { error: "Unauthorised" });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  }
  const result = await runSync();
  return json(result.status === "error" || result.status === "token_expired" ? 502 : 200, result);
};
