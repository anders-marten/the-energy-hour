// Runs the real SQL against a disposable PostgreSQL. The schema must already be
// migrated with migrations/001_init.sql (app_role = the role in STATS_TEST_APP_URL).
//   STATS_TEST_OWNER_URL=postgres://... STATS_TEST_APP_URL=postgres://... npm run test:db
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createHandler, createRateLimiter, RECORD_SQL, STATS_SQL } from "../src/service.js";

const owner = new pg.Pool({ connectionString: process.env.STATS_TEST_OWNER_URL });
const app = new pg.Pool({ connectionString: process.env.STATS_TEST_APP_URL, max: 1 });
after(() => Promise.all([owner.end(), app.end()]));

const TODAY = "(now() AT TIME ZONE 'Europe/Stockholm')::date";

async function reset() {
  await owner.query("TRUNCATE energy_hour.listening_daily");
}

function handlerFor(ids) {
  return createHandler({
    query: (sql, params) => app.query(sql, params),
    loadTrackIds: async () => new Set(ids),
    allowedOrigins: ["https://the-energy-hour.com"],
    rateLimiter: createRateLimiter({ limit: 1000, windowMs: 60000 }),
    statsCacheMs: 0,
    log: { error() {} }
  });
}

const post = (trackId, event) => ({
  httpMethod: "POST",
  path: "/listening-event",
  headers: { Origin: "https://the-energy-hour.com" },
  body: JSON.stringify({ trackId, event })
});

test("concurrent events are all counted (atomic upsert)", async () => {
  await reset();
  const handle = handlerFor(["111"]);
  const results = await Promise.all([
    ...Array.from({ length: 40 }, () => handle(post("111", "listened-30-seconds"))),
    ...Array.from({ length: 15 }, () => handle(post("111", "completed")))
  ]);
  assert.ok(results.every((r) => r.statusCode === 204));
  const { rows } = await owner.query("SELECT listens, completed FROM energy_hour.listening_daily WHERE track_id = '111'");
  assert.deepEqual(rows, [{ listens: 40, completed: 15 }]);
});

test("stats use calendar days: today and the 29 days before count as last 30 days", async () => {
  await reset();
  await owner.query(
    `INSERT INTO energy_hour.listening_daily (track_id, day, listens) VALUES
      ('111', ${TODAY}, 2), ('111', ${TODAY} - 29, 3), ('111', ${TODAY} - 30, 5), ('222', ${TODAY} - 400, 7)`
  );
  const res = await handlerFor([]) ({ httpMethod: "GET", path: "/stats", headers: {} });
  assert.deepEqual(JSON.parse(res.body), {
    tracks: { "111": { total: 10, last30Days: 5 }, "222": { total: 7, last30Days: 0 } }
  });
});

test("the function's role can read and write counts but nothing more", async () => {
  await reset();
  await app.query(RECORD_SQL, ["111", 1, 0]);
  await app.query(STATS_SQL);
  await assert.rejects(app.query("DELETE FROM energy_hour.listening_daily"), /permission denied/);
  await assert.rejects(app.query("TRUNCATE energy_hour.listening_daily"), /permission denied/);
  await assert.rejects(app.query("DROP TABLE energy_hour.listening_daily"), /must be owner|permission denied/);
  await assert.rejects(app.query("CREATE TABLE energy_hour.x (id int)"), /permission denied/);
});

test("the check constraints refuse negative counts", async () => {
  await assert.rejects(
    owner.query(`INSERT INTO energy_hour.listening_daily (track_id, day, listens) VALUES ('111', ${TODAY} - 1, -1)`),
    /listening_daily_listens_nonnegative/
  );
});
