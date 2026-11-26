import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, createRateLimiter, createTrackIdLoader, RECORD_SQL, STATS_SQL } from "../src/service.js";

const ORIGIN = "https://the-energy-hour.com";

function setup(overrides = {}) {
  const queries = [];
  const handle = createHandler({
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === STATS_SQL) return { rows: [{ track_id: "111", total: "12", last_30_days: "3" }] };
      return { rows: [] };
    },
    loadTrackIds: async () => new Set(["111", "222"]),
    allowedOrigins: [ORIGIN, "https://www.the-energy-hour.com"],
    log: { error() {} },
    ...overrides
  });
  return { handle, queries };
}

function post(body, { origin = ORIGIN, ip = "203.0.113.1", raw = false } = {}) {
  return {
    httpMethod: "POST",
    path: "/listening-event",
    headers: { Origin: origin, "Content-Type": "text/plain", "X-Forwarded-For": ip },
    body: raw ? body : JSON.stringify(body)
  };
}

test("records a 30-second listen as one listen", async () => {
  const { handle, queries } = setup();
  const res = await handle(post({ trackId: "111", event: "listened-30-seconds" }));
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], ORIGIN);
  assert.deepEqual(queries, [{ sql: RECORD_SQL, params: ["111", 1, 0] }]);
});

test("records a completion separately", async () => {
  const { handle, queries } = setup();
  const res = await handle(post({ trackId: "222", event: "completed" }));
  assert.equal(res.statusCode, 204);
  assert.deepEqual(queries[0].params, ["222", 0, 1]);
});

test("accepts a base64-encoded body", async () => {
  const { handle, queries } = setup();
  const event = post({ trackId: "111", event: "completed" });
  event.body = Buffer.from(event.body).toString("base64");
  event.isBase64Encoded = true;
  assert.equal((await handle(event)).statusCode, 204);
  assert.equal(queries.length, 1);
});

test("rejects unknown tracks, events and malformed payloads without writing", async () => {
  const { handle, queries } = setup();
  assert.equal((await handle(post({ trackId: "999", event: "completed" }))).statusCode, 404);
  assert.equal((await handle(post({ trackId: "111", event: "started" }))).statusCode, 400);
  assert.equal((await handle(post({ trackId: 111, event: "completed" }))).statusCode, 400);
  assert.equal((await handle(post({ trackId: "../x", event: "completed" }))).statusCode, 400);
  assert.equal((await handle(post("{not json", { raw: true }))).statusCode, 400);
  assert.equal((await handle(post("x".repeat(2000), { raw: true }))).statusCode, 413);
  assert.equal(queries.length, 0);
});

test("rejects other origins and requests without an origin", async () => {
  const { handle, queries } = setup();
  const other = await handle(post({ trackId: "111", event: "completed" }, { origin: "https://evil.example" }));
  assert.equal(other.statusCode, 403);
  assert.equal(other.headers["Access-Control-Allow-Origin"], undefined);
  assert.equal((await handle(post({ trackId: "111", event: "completed" }, { origin: "" }))).statusCode, 403);
  assert.equal(queries.length, 0);
});

test("allows the www origin", async () => {
  const { handle } = setup();
  const res = await handle(post({ trackId: "111", event: "completed" }, { origin: "https://www.the-energy-hour.com" }));
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://www.the-energy-hour.com");
});

test("rate limits one client without affecting others", async () => {
  const { handle } = setup({ rateLimiter: createRateLimiter({ limit: 2, windowMs: 60000 }) });
  const event = { trackId: "111", event: "completed" };
  assert.equal((await handle(post(event))).statusCode, 204);
  assert.equal((await handle(post(event))).statusCode, 204);
  assert.equal((await handle(post(event))).statusCode, 429);
  assert.equal((await handle(post(event, { ip: "203.0.113.2" }))).statusCode, 204);
});

test("rate limit window resets", () => {
  let time = 0;
  const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  time = 1000;
  assert.equal(allow("a"), true);
});

test("returns 503 when the playlist cannot be loaded", async () => {
  const { handle, queries } = setup({ loadTrackIds: async () => { throw new Error("down"); } });
  assert.equal((await handle(post({ trackId: "111", event: "completed" }))).statusCode, 503);
  assert.equal(queries.length, 0);
});

test("returns 500 without details when the database fails", async () => {
  const { handle } = setup({ query: async () => { throw new Error("connection refused"); } });
  const res = await handle(post({ trackId: "111", event: "completed" }));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body, "");
});

test("serves stats for all tracks with numbers and cache headers", async () => {
  const { handle } = setup();
  const res = await handle({ httpMethod: "GET", path: "/stats", headers: { Origin: ORIGIN } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "public, max-age=600");
  assert.equal(res.headers["Access-Control-Allow-Origin"], ORIGIN);
  assert.deepEqual(JSON.parse(res.body), { tracks: { "111": { total: 12, last30Days: 3 } } });
});

test("caches stats in memory between database reads", async () => {
  let time = 0;
  const { handle, queries } = setup({ now: () => time, statsCacheMs: 1000 });
  const get = { httpMethod: "GET", path: "/stats/", headers: {} };
  await handle(get);
  await handle(get);
  assert.equal(queries.length, 1);
  time = 1000;
  await handle(get);
  assert.equal(queries.length, 2);
});

test("unknown routes and methods return 404", async () => {
  const { handle } = setup();
  assert.equal((await handle({ httpMethod: "GET", path: "/listening-event" })).statusCode, 404);
  assert.equal((await handle({ httpMethod: "DELETE", path: "/stats" })).statusCode, 404);
  assert.equal((await handle({ httpMethod: "GET", path: "/" })).statusCode, 404);
});

test("track id loader caches and falls back to the last good playlist", async () => {
  let time = 0;
  let calls = 0;
  let fail = false;
  const loader = createTrackIdLoader({
    url: "https://example.test/playlist.json",
    ttlMs: 1000,
    now: () => time,
    fetchImpl: async () => {
      calls += 1;
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => [{ id: "111" }, { id: "222" }, {}] };
    }
  });
  assert.deepEqual([...(await loader())], ["111", "222"]);
  await loader();
  assert.equal(calls, 1);
  time = 1000;
  fail = true;
  assert.deepEqual([...(await loader())], ["111", "222"]);
  assert.equal(calls, 2);
});

test("track id loader fails when it has never loaded", async () => {
  const loader = createTrackIdLoader({ url: "x", fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(loader());
});
