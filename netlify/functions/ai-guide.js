// MOYENDA AI GUIDE: server-side only. No API key ever reaches the browser.
// Environment variables (set in Netlify > Site settings > Environment variables):
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   AI_MODEL (optional), SUPPORT_EMAIL, SUPPORT_WHATSAPP (international format, digits only)

const MAX_MESSAGE = 500;          // characters per visitor message
const HISTORY_TURNS = 6;          // previous messages sent to the model for follow-ups
const RATE_LIMIT = { limit: 20, windowSeconds: 600 }; // 20 messages per 10 minutes per visitor
const ESCALATE_TOKEN = "[ESCALATE]";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// Strip control characters and trim. Reject anything that is not plain text.
function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text || text.length > max) return null;
  return text;
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return { url: url.replace(/\/$/, ""), key };
}

async function sb(path, { method = "GET", body, prefer } = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function rpc(name, args) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status}`);
  return res.json();
}

function visitorKey(event) {
  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown").slice(0, 64);
  return `ai:${ip}`;
}

async function loadHistory(conversationId) {
  const rows = await sb(
    `messages?conversation_id=eq.${conversationId}&select=role,content&order=created_at.desc&limit=${HISTORY_TURNS}`
  );
  return (rows || []).reverse();
}

// Build the grounding context. Only APPROVED FAQ entries are included.
function buildContext(entries) {
  if (!entries.length) return "No approved knowledge-base entries matched this question.";
  return entries
    .map((e, i) => `[${i + 1}] (${e.category}) Q: ${e.question}\nA: ${e.answer}`)
    .join("\n\n");
}

function systemPrompt(context) {
  const supportEmail = process.env.SUPPORT_EMAIL || "the Moyenda team";
  return [
    "You are MOYENDA AI GUIDE, the assistant for Moyenda Tour Guide, a tour company in Malawi.",
    "Answer ONLY using the approved knowledge-base entries below. Do not use outside knowledge about prices, park rules, availability, or company history.",
    "If the entries do not answer the question, reply with exactly the token " + ESCALATE_TOKEN + " and nothing else.",
    "When recommending destinations or activities, base the recommendation only on the entries.",
    "Never invent prices, testimonials, bookings, or confirmations. Say that bookings are confirmed only after the company replies.",
    "Keep answers short, warm and practical. Plain text, no markdown headings.",
    `Human support contact: ${supportEmail}.`,
    "",
    "KNOWLEDGE BASE ENTRIES:",
    context
  ].join("\n");
}

async function callModel(messages, context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-haiku-5-5",
      max_tokens: 500,
      system: systemPrompt(context),
      messages
    })
  });
  if (!res.ok) throw new Error(`Model request failed: ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  let input;
  try { input = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Invalid request" }); }

  const message = cleanText(input.message, MAX_MESSAGE);
  if (!message) return reply(400, { error: "Please type a question (up to 500 characters)." });

  let conversationId = input.conversationId;
  if (conversationId && !isUuid(conversationId)) return reply(400, { error: "Invalid conversation" });

  const pagePath = cleanText(input.pagePath || "", 300) || null;

  try {
    const allowed = await rpc("hit_rate_limit", {
      p_key: visitorKey(event),
      p_limit: RATE_LIMIT.limit,
      p_window_seconds: RATE_LIMIT.windowSeconds
    });
    if (allowed === false) {
      return reply(429, { error: "You have sent many questions. Please wait a few minutes and try again." });
    }

    // Start a conversation if this is the first message.
    if (!conversationId) {
      const created = await sb("conversations", {
        method: "POST",
        body: { page_path: pagePath, user_agent: (event.headers["user-agent"] || "").slice(0, 300) },
        prefer: "return=representation"
      });
      conversationId = created[0].id;
    } else {
      const existing = await sb(`conversations?select=id&id=eq.${conversationId}&limit=1`);
      if (!existing || existing.length === 0) {
        const created = await sb("conversations", {
          method: "POST",
          body: { page_path: pagePath, user_agent: (event.headers["user-agent"] || "").slice(0, 300) },
          prefer: "return=representation"
        });
        conversationId = created[0].id;
      }
    }

    // Retrieve approved entries for this question (RAG).
    const entries = await rpc("search_faq", { p_query: message, p_limit: 5 });
    const context = buildContext(entries || []);
    const faqIds = (entries || []).map((e) => e.id);

    // Conversation history gives follow-ups their context.
    const history = await loadHistory(conversationId);
    const modelMessages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message }
    ];

    const answer = await callModel(modelMessages, context);
    const escalate = !entries || entries.length === 0 || !answer || answer.includes(ESCALATE_TOKEN);

    const userRow = { conversation_id: conversationId, role: "user", content: message };
    const botRow = {
      conversation_id: conversationId,
      role: "assistant",
      content: escalate ? "" : answer,
      faq_ids: faqIds
    };

    if (escalate) {
      botRow.content = "I do not have a verified answer to that yet, so I have passed your question to our team. " +
        "You can reach a person directly" +
        (process.env.SUPPORT_EMAIL ? ` at ${process.env.SUPPORT_EMAIL}` : "") +
        (process.env.SUPPORT_WHATSAPP ? ` or on WhatsApp at +${process.env.SUPPORT_WHATSAPP}` : "") + ".";
      await sb("unanswered_questions", {
        method: "POST",
        body: { question: message, conversation_id: conversationId, status: "escalated" }
      });
    }

    await sb("messages", { method: "POST", body: [userRow, botRow] });

    return reply(200, {
      conversationId,
      answer: botRow.content,
      escalated: escalate
    });
  } catch (err) {
    // Log server-side only; never expose internals to the visitor.
    console.error("ai-guide error:", err.message);
    return reply(503, {
      error: "The guide is unavailable right now. Please contact us directly or try again shortly."
    });
  }
};
