// Creates or removes a DEMO admin account. For development and testing only.
// No password is stored in this file. Credentials come from environment variables.
//
// Create:  node scripts/demo-admin.js create
// Remove:  node scripts/demo-admin.js remove     (run before production)
//
// Required environment variables (set them in your shell, never in a committed file):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   DEMO_ADMIN_EMAIL
//   DEMO_ADMIN_PASSWORD      (at least 12 characters)
//   DEMO_ADMIN_ROLE          (optional: owner, editor or viewer; default viewer)

const action = process.argv[2];
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.DEMO_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD || "";
const role = process.env.DEMO_ADMIN_ROLE || "viewer";

function fail(msg) { console.error("Error: " + msg); process.exit(1); }

if (!url || !key) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("DEMO_ADMIN_EMAIL is missing or invalid.");
if (!["owner", "editor", "viewer"].includes(role)) fail("DEMO_ADMIN_ROLE must be owner, editor or viewer.");

const auth = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function findUserId() {
  // Supabase Admin API: list users and match the email (small projects only).
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: auth });
  if (!res.ok) throw new Error(`List users failed: ${res.status}`);
  const data = await res.json();
  const match = (data.users || []).find((u) => (u.email || "").toLowerCase() === email);
  return match ? match.id : null;
}

async function create() {
  if (password.length < 12) fail("DEMO_ADMIN_PASSWORD must be at least 12 characters.");
  let id = await findUserId();
  if (!id) {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    if (!res.ok) fail(`Create user failed: ${res.status}`);
    id = (await res.json()).id;
    console.log("Created auth user.");
  } else {
    console.log("Auth user already exists. Role will be updated; password unchanged.");
  }

  const roleRes = await fetch(`${url}/rest/v1/admin_users?on_conflict=user_id`, {
    method: "POST",
    headers: { ...auth, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: id, role })
  });
  if (!roleRes.ok) fail(`Set admin role failed: ${roleRes.status}`);
  console.log(`Demo admin ready: ${email} (role: ${role}). Sign in at /admin.html.`);
}

async function remove() {
  const id = await findUserId();
  if (!id) { console.log("No demo admin account found. Nothing to remove."); return; }
  // Deleting the auth user cascades to admin_users (see schema.sql).
  const res = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: auth });
  if (!res.ok) fail(`Delete user failed: ${res.status}`);
  console.log(`Removed demo admin ${email}. Sign-in for this account is now impossible.`);
}

if (!email) fail("DEMO_ADMIN_EMAIL must be set.");
if (action === "create") create().catch((e) => fail(e.message));
else if (action === "remove") remove().catch((e) => fail(e.message));
else fail('Use "create" or "remove" as the first argument.');
