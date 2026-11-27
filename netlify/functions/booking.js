// Booking requests. A request is stored as "requested" and is NOT a confirmed booking.
// Uses the service role key server-side only.

const ACTIVITIES = [
  "Mountain Hiking", "Game Drive Safari", "Boat Riding Safari",
  "Cultural Tour", "Birdwatching Safari", "Walking Safari", "Not sure yet"
];
const DESTINATIONS = [
  "Mulanje Mountain", "Michiru Mountain", "Majete Game Reserve", "Liwonde National Park",
  "Lake Malawi National Park", "Kungoni Cultural Centre", "Other or not sure"
];
const RATE_LIMIT = { limit: 5, windowSeconds: 3600 }; // 5 requests per hour per visitor

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function validate(input) {
  const errors = {};
  const name = text(input.full_name, 120);
  const email = text(input.email, 200).toLowerCase();
  const phone = text(input.phone, 40);
  const activity = text(input.activity, 80);
  const destination = text(input.destination, 120);
  const message = text(input.message, 2000);
  const date = text(input.tour_date, 10);
  const participants = Number(input.participants);

  if (name.length < 2) errors.full_name = "Please enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.email = "Please enter a valid email address.";
  if (!/^[+0-9 ()-]{6,40}$/.test(phone)) errors.phone = "Please enter a valid phone or WhatsApp number.";
  if (!ACTIVITIES.includes(activity)) errors.activity = "Please choose an activity.";
  if (destination && !DESTINATIONS.includes(destination)) errors.destination = "Please choose a listed destination.";
  if (!Number.isInteger(participants) || participants < 1 || participants > 50) errors.participants = "Participants must be between 1 and 50.";
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.tour_date = "Invalid date.";
  if (date) {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const validDate = parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
    if (!validDate) {
      errors.tour_date = "Invalid date.";
    } else {
      const today = new Date();
      const todayText = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
      if (date < todayText) errors.tour_date = "The date cannot be in the past.";
    }
  }

  return {
    errors,
    row: { full_name: name, email, phone, activity, destination: destination || null, tour_date: date || null, participants, message: message || null, status: "requested" }
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  let input;
  try { input = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Invalid request" }); }

  // Honeypot: real visitors leave this empty.
  if (input.website) return reply(200, { ok: true });

  const { errors, row } = validate(input);
  if (Object.keys(errors).length) return reply(422, { error: "Please check the highlighted fields.", fields: errors });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return reply(503, { error: "Booking is temporarily unavailable. Please use WhatsApp." });
  const base = SUPABASE_URL.replace(/\/$/, "");
  const key = SUPABASE_SERVICE_ROLE_KEY;

  try {
    const ip = (event.headers["x-nf-client-connection-ip"] || "unknown").slice(0, 64);
    const rl = await fetch(`${base}/rest/v1/rpc/hit_rate_limit`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: `booking:${ip}`, p_limit: RATE_LIMIT.limit, p_window_seconds: RATE_LIMIT.windowSeconds })
    });
    if (!rl.ok || (await rl.json()) === false) {
      return reply(429, { error: "Too many booking requests from this connection. Please try again later or contact us on WhatsApp." });
    }

    const res = await fetch(`${base}/rest/v1/bookings`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(`Insert failed: ${res.status}`);
    return reply(200, { ok: true, message: "Thank you. Your request has been received. It is not confirmed until our team replies." });
  } catch (err) {
    console.error("booking error:", err.message);
    return reply(503, { error: "Booking is temporarily unavailable. Please use WhatsApp." });
  }
};
