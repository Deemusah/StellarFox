# Disaster Recovery Plan

This document defines the backup strategy, recovery procedures, and recovery
targets for the StellarFox backend. It is the authoritative reference for
recovering from data loss or infrastructure failure.

## Scope

In scope:

- Documented disaster recovery (DR) procedures
- Recovery testing procedures and checklists
- Recovery Time Objective (RTO) and Recovery Point Objective (RPO) targets

Out of scope (tracked separately):

- Multi-region replication
- Automated failover
- DR automation / orchestration tooling

## Recovery Targets

| Tier | Data / Service | RTO | RPO |
| --- | --- | --- | --- |
| 1 | Primary database (users, transactions) | 1 hour | 15 minutes |
| 2 | Application services (API, WebSocket) | 30 minutes | N/A (stateless) |
| 3 | Configuration and secrets | 4 hours | 24 hours |
| 4 | Logs and metrics | 24 hours | 1 hour |

- **RTO (Recovery Time Objective):** maximum acceptable time to restore service
  after a disruption.
- **RPO (Recovery Point Objective):** maximum acceptable amount of data loss
  measured in time before the disruption.

## Backup Strategy

| Asset | Method | Frequency | Retention | Location |
| --- | --- | --- | --- | --- |
| Primary database | Full logical dump | Daily 02:00 UTC | 30 days | Encrypted object storage |
| Primary database | Incremental / WAL archive | Every 15 minutes | 7 days | Encrypted object storage |
| Configuration | Version-controlled config | On change | Indefinite | Git repository |
| Secrets | Encrypted secret store export | Weekly | 90 days | Encrypted object storage |
| Logs / metrics | Managed log retention | Continuous | 30 days | Log provider |

Backups MUST be encrypted at rest and in transit. Backup integrity is verified
by a checksum recorded alongside each artifact.

## Recovery Procedures

### 1. Database Restore

1. Declare the incident and assign an incident commander.
2. Freeze writes to the affected database (enable maintenance mode).
3. Identify the most recent valid backup within the RPO window.
4. Verify the backup checksum before restoring.
5. Restore the latest full dump, then replay incremental / WAL archives up to
the target recovery point.
6. Run integrity checks (row counts, foreign keys, application smoke queries).
7. Re-enable writes and confirm the application health endpoint is green.

### 2. Application Service Recovery

1. Redeploy the last known-good release from the container registry.
2. Restore environment configuration from the version-controlled config.
3. Confirm the API and WebSocket health checks pass.
4. Re-point traffic to the recovered instances.

### 3. Configuration and Secrets Recovery

1. Restore configuration from the Git repository at the last good commit.
2. Restore secrets from the encrypted secret store export.
3. Rotate any credentials that may have been exposed during the incident.

### 4. Communication

1. Notify stakeholders within 15 minutes of incident declaration.
2. Provide status updates at least every 30 minutes until resolution.
3. Publish a post-incident review within 5 business days.

## Recovery Test Procedure

Recovery procedures MUST be tested at least quarterly. Each test follows this
checklist:

- [ ] Schedule a maintenance window and notify stakeholders.
- [ ] Provision an isolated recovery environment (no production traffic).
- [ ] Restore the most recent database backup and replay incrementals.
- [ ] Record the elapsed restore time and compare against the RTO target.
- [ ] Record the age of the newest restored record and compare against the RPO
target.
- [ ] Run application smoke tests against the recovered environment.
- [ ] Verify configuration and secrets restore correctly.
- [ ] Document any deviations, failures, and follow-up actions.
- [ ] Tear down the recovery environment.

### Success Criteria

A recovery test is successful when:

- The database and application are fully restored in the isolated environment.
- Measured restore time is within the RTO target for the tested tier.
- Measured data loss is within the RPO target for the tested tier.
- All smoke tests pass against the recovered environment.

### Test Record Template

| Field | Value |
| --- | --- |
| Test date | |
| Tested tier | |
| Backup used | |
| Measured RTO | |
| Measured RPO | |
| Result (pass/fail) | |
| Follow-up actions | |

## Review

This plan is reviewed after every incident and at least annually. Updates are
made via pull request to this document.
