/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE market_audit_log (
      id BIGSERIAL PRIMARY KEY,
      market_id TEXT NOT NULL,
      previous_market_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      before_snapshot JSONB,
      after_snapshot JSONB,
      changed_fields TEXT[] NOT NULL DEFAULT '{}',
      actor_id TEXT,
      database_user TEXT NOT NULL,
      application_name TEXT,
      transaction_id BIGINT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE INDEX market_audit_log_market_id_idx
      ON market_audit_log (market_id, occurred_at, id);
    CREATE INDEX market_audit_log_previous_market_id_idx
      ON market_audit_log (previous_market_id, occurred_at, id)
      WHERE previous_market_id IS NOT NULL;

    CREATE FUNCTION capture_market_audit_event() RETURNS trigger
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

    CREATE TRIGGER markets_audit_changes
      AFTER INSERT OR UPDATE OR DELETE ON markets
      FOR EACH ROW EXECUTE FUNCTION capture_market_audit_event();

    CREATE FUNCTION reject_market_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'market_audit_log is append-only'
        USING ERRCODE = '55000';
    END;
    $$;

    CREATE TRIGGER market_audit_log_reject_mutation
      BEFORE UPDATE OR DELETE ON market_audit_log
      FOR EACH ROW EXECUTE FUNCTION reject_market_audit_mutation();
    CREATE TRIGGER market_audit_log_reject_truncate
      BEFORE TRUNCATE ON market_audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION reject_market_audit_mutation();

    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON market_audit_log FROM PUBLIC;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS markets_audit_changes ON markets;
    DROP TRIGGER IF EXISTS market_audit_log_reject_mutation ON market_audit_log;
    DROP TRIGGER IF EXISTS market_audit_log_reject_truncate ON market_audit_log;
    DROP FUNCTION IF EXISTS capture_market_audit_event();
    DROP FUNCTION IF EXISTS reject_market_audit_mutation();
    DROP TABLE IF EXISTS market_audit_log;
  `);
};
