// Scaleway Serverless Functions entry point (handler: src/handler.handle).
import pg from "pg";
import { createHandler, createTrackIdLoader } from "./service.js";

const DEFAULT_ORIGINS = "https://the-energy-hour.com,https://www.the-energy-hour.com";

function databaseSsl() {
  if (process.env.STATS_DATABASE_SSL === "off") return false; // local tests only
  const ca = process.env.STATS_DATABASE_CA?.replace(/\\n/g, "\n");
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.STATS_DATABASE_URL) throw new Error("STATS_DATABASE_URL is not set.");
    pool = new pg.Pool({
      connectionString: process.env.STATS_DATABASE_URL,
      ssl: databaseSsl(),
      // One connection per instance keeps scale-out within the shared instance's limit.
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000
    });
    pool.on("error", () => console.error("A database connection was closed."));
  }
  return pool;
}

const handleRequest = createHandler({
  query: (sql, params) => getPool().query(sql, params),
  loadTrackIds: createTrackIdLoader({ url: process.env.STATS_PLAYLIST_URL || "https://the-energy-hour.com/playlist.json" }),
  allowedOrigins: (process.env.STATS_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((o) => o.trim()).filter(Boolean)
});

export async function handle(event, _context) {
  return handleRequest(event);
}
