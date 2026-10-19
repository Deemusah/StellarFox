CREATE TABLE IF NOT EXISTS markets (
  id               SERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL UNIQUE,
  contract_address TEXT        NOT NULL,
  match_id         TEXT        NOT NULL,
  fighter_a        TEXT        NOT NULL,
  fighter_b        TEXT        NOT NULL,
  category         TEXT        NOT NULL DEFAULT 'OTHER',
  weight_class     TEXT        NOT NULL DEFAULT '',
  title_fight      BOOLEAN     NOT NULL DEFAULT FALSE,
  venue            TEXT        NOT NULL DEFAULT '',
  scheduled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT        NOT NULL DEFAULT 'open',
  outcome          TEXT,
  pool_a           NUMERIC     NOT NULL DEFAULT 0,
  pool_b           NUMERIC     NOT NULL DEFAULT 0,
  pool_draw        NUMERIC     NOT NULL DEFAULT 0,
  total_pool       NUMERIC     NOT NULL DEFAULT 0,
  fee_bps          INTEGER     NOT NULL DEFAULT 200,
  resolved_at      TIMESTAMPTZ,
  oracle_used      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ledger_sequence  INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS probability_snapshots (
  id               BIGSERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL,
  sampled_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  source           TEXT        NOT NULL CHECK (source IN ('interval', 'event')),
  probability_a    NUMERIC(12,10) NOT NULL CHECK (probability_a BETWEEN 0 AND 1),
  probability_b    NUMERIC(12,10) NOT NULL CHECK (probability_b BETWEEN 0 AND 1),
  probability_draw NUMERIC(12,10) NOT NULL CHECK (probability_draw BETWEEN 0 AND 1),
  pool_a           NUMERIC     NOT NULL,
  pool_b           NUMERIC     NOT NULL,
  pool_draw        NUMERIC     NOT NULL,
  total_pool       NUMERIC     NOT NULL,
  CONSTRAINT probability_snapshots_market_sample_unique UNIQUE (market_id, sampled_at, source)
);
CREATE INDEX IF NOT EXISTS probability_snapshots_market_sample_idx
  ON probability_snapshots (market_id, sampled_at);

CREATE TABLE IF NOT EXISTS market_audit_log (
  id                BIGSERIAL PRIMARY KEY,
  market_id         TEXT        NOT NULL,
  previous_market_id TEXT,
  operation         TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  before_snapshot   JSONB,
  after_snapshot    JSONB,
  changed_fields    TEXT[]      NOT NULL DEFAULT '{}',
  actor_id          TEXT,
  database_user     TEXT        NOT NULL,
  application_name  TEXT,
  transaction_id    BIGINT      NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS market_audit_log_market_id_idx
  ON market_audit_log (market_id, occurred_at, id);
CREATE INDEX IF NOT EXISTS market_audit_log_previous_market_id_idx
  ON market_audit_log (previous_market_id, occurred_at, id)
  WHERE previous_market_id IS NOT NULL;

CREATE OR REPLACE FUNCTION capture_market_audit_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  before_row JSONB;
  after_row JSONB;
  changed TEXT[];
  event_market_id TEXT;
  prior_market_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    after_row := to_jsonb(NEW);
    event_market_id := NEW.market_id;
    SELECT array_agg(key ORDER BY key)
      INTO changed
      FROM jsonb_object_keys(after_row) AS keys(key);
  ELSIF TG_OP = 'UPDATE' THEN
    before_row := to_jsonb(OLD);
    after_row := to_jsonb(NEW);

    IF before_row IS NOT DISTINCT FROM after_row THEN
      RETURN NEW;
    END IF;

    event_market_id := NEW.market_id;
    IF OLD.market_id IS DISTINCT FROM NEW.market_id THEN
      prior_market_id := OLD.market_id;
    END IF;

    SELECT array_agg(field ORDER BY field)
      INTO changed
      FROM (
        SELECT COALESCE(old_entry.key, new_entry.key) AS field
        FROM jsonb_each(before_row) AS old_entry
        FULL JOIN jsonb_each(after_row) AS new_entry USING (key)
        WHERE old_entry.value IS DISTINCT FROM new_entry.value
      ) AS differences;
  ELSE
    before_row := to_jsonb(OLD);
    event_market_id := OLD.market_id;
    SELECT array_agg(key ORDER BY key)
      INTO changed
      FROM jsonb_object_keys(before_row) AS keys(key);
  END IF;

  INSERT INTO market_audit_log (
    market_id, previous_market_id, operation, before_snapshot, after_snapshot,
    changed_fields, actor_id, database_user, application_name, transaction_id,
    occurred_at
  ) VALUES (
    event_market_id, prior_market_id, TG_OP, before_row, after_row,
    COALESCE(changed, '{}'),
    NULLIF(current_setting('app.actor_id', true), ''),
    session_user,
    NULLIF(current_setting('application_name', true), ''),
    txid_current(),
    clock_timestamp()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_market_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'market_audit_log is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS markets_audit_changes ON markets;
CREATE TRIGGER markets_audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON markets
  FOR EACH ROW EXECUTE FUNCTION capture_market_audit_event();

DROP TRIGGER IF EXISTS market_audit_log_reject_mutation ON market_audit_log;
CREATE TRIGGER market_audit_log_reject_mutation
  BEFORE UPDATE OR DELETE ON market_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_market_audit_mutation();
DROP TRIGGER IF EXISTS market_audit_log_reject_truncate ON market_audit_log;
CREATE TRIGGER market_audit_log_reject_truncate
  BEFORE TRUNCATE ON market_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_market_audit_mutation();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON market_audit_log FROM PUBLIC;
CREATE INDEX IF NOT EXISTS markets_category_idx ON markets(category);

CREATE TABLE IF NOT EXISTS bets (
  id               SERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL REFERENCES markets(market_id),
  bettor_address   TEXT        NOT NULL,
  side             TEXT        NOT NULL,
  amount           NUMERIC     NOT NULL,
  amount_xlm       NUMERIC     NOT NULL DEFAULT 0,
  placed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  claimed          BOOLEAN     NOT NULL DEFAULT FALSE,
  claimed_at       TIMESTAMPTZ,
  payout           NUMERIC,
  tx_hash          TEXT        NOT NULL UNIQUE,
  ledger_sequence  INTEGER     NOT NULL DEFAULT 0
);

-- Indexes for bets table
CREATE INDEX IF NOT EXISTS bets_market_id_idx ON bets(market_id);
CREATE INDEX IF NOT EXISTS bets_bettor_address_idx ON bets(bettor_address);
CREATE INDEX IF NOT EXISTS bets_expires_at_idx ON bets(expires_at);
CREATE INDEX IF NOT EXISTS bets_market_id_claimed_idx ON bets(market_id, claimed);
CREATE UNIQUE INDEX IF NOT EXISTS bets_tx_hash_idx ON bets(tx_hash);

CREATE TABLE IF NOT EXISTS blockchain_events (
  id                SERIAL PRIMARY KEY,
  contract_address  TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  payload           JSONB       NOT NULL DEFAULT '{}',
  ledger_sequence   INTEGER     NOT NULL,
  ledger_close_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash           TEXT        NOT NULL UNIQUE,
  processed         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  id                      SERIAL PRIMARY KEY,
  last_processed_ledger   INTEGER     NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_ledger_ranges (
  id             SERIAL PRIMARY KEY,
  start_ledger   INTEGER     NOT NULL,
  end_ledger     INTEGER     NOT NULL,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (start_ledger, end_ledger)
);
CREATE INDEX IF NOT EXISTS indexer_ledger_ranges_start_idx ON indexer_ledger_ranges (start_ledger);

CREATE TABLE IF NOT EXISTS oracle_reports (
  id               SERIAL PRIMARY KEY,
  match_id         TEXT        NOT NULL,
  oracle_address   TEXT        NOT NULL,
  outcome          TEXT        NOT NULL,
  reported_at      TIMESTAMPTZ NOT NULL,
  signature        TEXT        NOT NULL,
  accepted         BOOLEAN     NOT NULL DEFAULT FALSE,
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
  id               SERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL REFERENCES markets(market_id),
  reason           TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'open',
  admin_notes      TEXT,
  final_outcome    TEXT,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id               SERIAL PRIMARY KEY,
  bettor_address   TEXT        NOT NULL,
  market_id        TEXT        NOT NULL REFERENCES markets(market_id),
  job_type         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_streaks (
  id                   SERIAL PRIMARY KEY,
  address              TEXT        NOT NULL,
  current_streak       INTEGER     NOT NULL DEFAULT 0,
  best_streak          INTEGER     NOT NULL DEFAULT 0,
  total_predictions    INTEGER     NOT NULL DEFAULT 0,
  last_prediction_date DATE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_streaks_address_unique UNIQUE (address)
);

CREATE TABLE IF NOT EXISTS achievements (
  id            SERIAL PRIMARY KEY,
  code          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  category      TEXT        NOT NULL DEFAULT 'general',
  threshold     INTEGER     NOT NULL DEFAULT 0,
  reward_label  TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT achievements_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id               SERIAL PRIMARY KEY,
  address          TEXT        NOT NULL,
  achievement_id   INTEGER     NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_achievements_address_achievement_unique UNIQUE (address, achievement_id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id                SERIAL PRIMARY KEY,
  referrer_address  TEXT        NOT NULL,
  referred_address  TEXT        NOT NULL,
  referral_code     TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at      TIMESTAMPTZ,
  CONSTRAINT referrals_referred_address_unique UNIQUE (referred_address)
);

CREATE TABLE IF NOT EXISTS referral_payouts (
  id                SERIAL PRIMARY KEY,
  referrer_address  TEXT        NOT NULL,
  referred_address  TEXT        NOT NULL,
  level             INTEGER     NOT NULL DEFAULT 1,
  amount            NUMERIC     NOT NULL DEFAULT 0,
  source_amount     NUMERIC     NOT NULL DEFAULT 0,
  rate_bps          INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id          SERIAL PRIMARY KEY,
  address     TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
