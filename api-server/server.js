"use strict";

const http = require("node:http");

const handlers = {
  "admin": require("../netlify/functions/admin").handler,
  "ai-guide": require("../netlify/functions/ai-guide").handler,
  "booking": require("../netlify/functions/booking").handler,
  "content": require("../netlify/functions/content").handler,
  "instagram": require("../netlify/functions/instagram").handler,
  "instagram-sync": require("../netlify/functions/instagram-sync").handler
};

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const MAX_BODY_BYTES = 1024 * 1024;
const METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, x-sync-secret";

function requestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (forwardedProto ? String(forwardedProto).split(",")[0] : req.socket.encrypted ? "https" : "http").trim();
  return `${protocol}://${req.headers.host}`;
}

function corsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return "";
  if (allowedOrigins.has("*")) return "*";
  if (allowedOrigins.has(origin) || origin === requestOrigin(req)) return origin;
  return null;
}

function applyCors(req, res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "600");
}

function sendJson(res, status, data, extraHeaders) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(extraHeaders || {})
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp =
      req.headers["x-nf-client-connection-ip"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      (forwardedFor && String(forwardedFor).split(",")[0].trim());
    if (forwardedIp) return String(forwardedIp).slice(0, 64);
  }
  return String(req.socket.remoteAddress || "unknown").slice(0, 64);
}

async function handle(req, res) {
  let url;
  try {
    url = new URL(req.url, "http://api.local");
  } catch {
    sendJson(res, 400, { error: "Invalid request URL." });
    return;
  }

  if (!url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const origin = corsOrigin(req);
  if (origin === null) {
    sendJson(res, 403, { error: "Origin is not allowed." });
    return;
  }
  applyCors(req, res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  const name = url.pathname.slice("/api/".length);
  const handler = handlers[name];
  if (!handler || name.includes("/")) {
    sendJson(res, 404, { error: "API endpoint not found." });
    return;
  }

  try {
    const body = await readBody(req);
    const requestHeaders = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value || "")])
    );
    requestHeaders["x-nf-client-connection-ip"] = clientIp(req);

    const event = {
      httpMethod: req.method,
      headers: requestHeaders,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body
    };
    const result = await handler(event);
    const headers = { ...(result.headers || {}) };
    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers.Vary = "Origin";
    }
    res.writeHead(result.statusCode || 200, headers);
    res.end(result.body || "");
  } catch (error) {
    if (error.statusCode === 413) {
      sendJson(res, 413, { error: error.message });
      return;
    }
    console.error("API request failed:", error.message);
    sendJson(res, 500, { error: "The service is temporarily unavailable." });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("API server error:", error.message);
    if (!res.headersSent) sendJson(res, 500, { error: "The service is temporarily unavailable." });
    else res.destroy();
  });
});

function runScheduledInstagramSync() {
  handlers["instagram-sync"]({ headers: {} })
    .then((result) => {
      if (result.statusCode >= 400) {
        console.error("Scheduled Instagram sync returned:", result.statusCode);
      }
    })
    .catch((error) => console.error("Scheduled Instagram sync failed:", error.message));
}

if (process.env.DISABLE_INSTAGRAM_SCHEDULE !== "true") {
  const interval = Number(process.env.INSTAGRAM_SYNC_INTERVAL_MS || 30 * 60 * 1000);
  if (!Number.isFinite(interval) || interval < 60 * 1000) {
    throw new Error("INSTAGRAM_SYNC_INTERVAL_MS must be at least 60000.");
  }
  const initialSync = setTimeout(runScheduledInstagramSync, 5000);
  const scheduledSync = setInterval(runScheduledInstagramSync, interval);
  initialSync.unref();
  scheduledSync.unref();
}

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Moyenda API listening on port ${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
