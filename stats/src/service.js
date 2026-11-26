import { createHash, randomBytes } from "node:crypto";

export const EVENTS = new Set(["listened-30-seconds", "completed"]);
const MAX_BODY_BYTES = 1024;
const TRACK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Calendar days in Stockholm, so "last 30 days" does not depend on the server's clock time.
const TODAY = "(now() AT TIME ZONE 'Europe/Stockholm')::date";

export const RECORD_SQL = `
INSERT INTO energy_hour.listening_daily (track_id, day, listens, completed)
VALUES ($1, ${TODAY}, $2, $3)
ON CONFLICT (track_id, day) DO UPDATE SET
  listens = energy_hour.listening_daily.listens + EXCLUDED.listens,
  completed = energy_hour.listening_daily.completed + EXCLUDED.completed`;

// day > today - 30 covers today and the 29 days before it.
export const STATS_SQL = `
SELECT track_id,
       sum(listens)::bigint AS total,
       coalesce(sum(listens) FILTER (WHERE day > ${TODAY} - 30), 0)::bigint AS last_30_days
FROM energy_hour.listening_daily
GROUP BY track_id`;

/**
 * Counts requests per client in fixed windows. The key is a salted hash that
 * only lives in this instance's memory; nothing is logged or stored.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const salt = randomBytes(16);
  const windows = new Map();
  return function allow(clientAddress) {
    if (!clientAddress) return true;
    const key = createHash("sha256").update(salt).update(clientAddress).digest("base64");
    const time = now();
    if (windows.size > 10000) {
      for (const [k, w] of windows) if (time - w.start >= windowMs) windows.delete(k);
    }
    const current = windows.get(key);
    if (!current || time - current.start >= windowMs) {
      windows.set(key, { start: time, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
}

function clientAddressOf(headers) {
  return String(headers["x-forwarded-for"] || "").split(",")[0].trim();
}

function decodeBody(event) {
  const body = event.body || "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : String(body);
}

/**
 * @param {object} deps
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: any[]}>} deps.query
 * @param {() => Promise<Set<string>>} deps.loadTrackIds
 * @param {string[]} deps.allowedOrigins
 */
export function createHandler({
  query,
  loadTrackIds,
  allowedOrigins,
  rateLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 }),
  statsCacheMs = 60 * 1000,
  now = Date.now,
  log = console
}) {
  const origins = new Set(allowedOrigins);
  let statsCache = null;

  function respond(statusCode, origin, { body, headers = {} } = {}) {
    const cors = origins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
    return {
      statusCode,
      headers: { ...cors, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? "" : JSON.stringify(body)
    };
  }

  async function recordEvent(event, headers, origin) {
    // sendBeacon always sends an Origin header on a cross-origin POST.
    if (!origins.has(origin)) return respond(403, origin);
    const raw = decodeBody(event);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return respond(413, origin);
    if (!rateLimiter(clientAddressOf(headers))) return respond(429, origin);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return respond(400, origin);
    }
    const trackId = payload?.trackId;
    const name = payload?.event;
    if (typeof trackId !== "string" || !TRACK_ID_PATTERN.test(trackId) || !EVENTS.has(name)) return respond(400, origin);

    let trackIds;
    try {
      trackIds = await loadTrackIds();
    } catch (error) {
      log.error("Could not load the playlist.", error?.message);
      return respond(503, origin);
    }
    if (!trackIds.has(trackId)) return respond(404, origin);

    const isListen = name === "listened-30-seconds";
    await query(RECORD_SQL, [trackId, isListen ? 1 : 0, isListen ? 0 : 1]);
    return respond(204, origin);
  }

  async function readStats(origin) {
    if (!statsCache || now() - statsCache.at >= statsCacheMs) {
      const { rows } = await query(STATS_SQL);
      const tracks = {};
      for (const row of rows) tracks[row.track_id] = { total: Number(row.total), last30Days: Number(row.last_30_days) };
      statsCache = { at: now(), body: { tracks } };
    }
    return respond(200, origin, { body: statsCache.body, headers: { "Cache-Control": "public, max-age=600" } });
  }

  return async function handle(event = {}) {
    const headers = lowerCaseHeaders(event.headers);
    const origin = headers.origin || "";
    const method = String(event.httpMethod || "GET").toUpperCase();
    const path = String(event.path || "/").replace(/\/+$/, "") || "/";
    try {
      if (method === "OPTIONS") {
        return respond(204, origin, {
          headers: { "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }
        });
      }
      if (path === "/listening-event" && method === "POST") return await recordEvent(event, headers, origin);
      if (path === "/stats" && (method === "GET" || method === "HEAD")) return await readStats(origin);
      if (path === "/health" && method === "GET") return respond(200, origin, { body: { ok: true } });
      return respond(404, origin);
    } catch (error) {
      log.error("Request failed.", error?.message);
      return respond(500, origin);
    }
  };
}

/** Loads track ids from the published playlist and keeps them for a while. */
export function createTrackIdLoader({ url, fetchImpl = fetch, ttlMs = 10 * 60 * 1000, now = Date.now }) {
  let cache = null;
  return async function loadTrackIds() {
    if (cache && now() - cache.at < ttlMs) return cache.ids;
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Playlist responded ${response.status}`);
      const playlist = await response.json();
      if (!Array.isArray(playlist)) throw new Error("Playlist is not an array");
      cache = { at: now(), ids: new Set(playlist.map((track) => String(track?.id || "")).filter(Boolean)) };
    } catch (error) {
      // Keep using the last good list rather than dropping listens.
      if (!cache) throw error;
      cache.at = now() - ttlMs + 60 * 1000; // try again in a minute
      return cache.ids;
    }
    return cache.ids;
  };
}
