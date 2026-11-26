-- Run once against the energy_hour database as its owner, not as the function's role:
--   psql "$OWNER_URL" -v app_role=energy_hour_app -f migrations/001_init.sql
-- Only daily totals per track are stored. No events, ids or addresses.

CREATE SCHEMA IF NOT EXISTS energy_hour;

CREATE TABLE IF NOT EXISTS energy_hour.listening_daily (
    track_id text NOT NULL,
    day date NOT NULL,
    listens integer NOT NULL DEFAULT 0,
    completed integer NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, day),
    CONSTRAINT listening_daily_listens_nonnegative CHECK (listens >= 0),
    CONSTRAINT listening_daily_completed_nonnegative CHECK (completed >= 0)
);

GRANT USAGE ON SCHEMA energy_hour TO :"app_role";
GRANT SELECT, INSERT, UPDATE ON energy_hour.listening_daily TO :"app_role";
