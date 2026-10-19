use crate::{errors::ContractError, types::*};

/// Validates that an outcome uses the schema currently understood by contracts.
pub fn validate_outcome_version(version: u32) -> Result<(), ContractError> {
    if version == CURRENT_OUTCOME_VERSION {
        Ok(())
    } else {
        Err(ContractError::InvalidOutcomeVersion)
    }
}

/// Validates that an oracle report uses the market's supported outcome schema.
pub fn validate_report_outcome_version(
    market_version: u32,
    report_version: u32,
) -> Result<(), ContractError> {
    validate_outcome_version(market_version)?;
    if report_version == market_version {
        Ok(())
    } else {
        Err(ContractError::InvalidOutcomeVersion)
    }
}

/// Migrates a stored outcome to a requested schema version.
///
/// Version 1 and version 2 share the same outcome variants; this explicit
/// migration records the new schema version while preserving the result.
pub fn migrate_outcome_version(
    outcome: &VersionedOutcome,
    target_version: u32,
) -> Result<VersionedOutcome, ContractError> {
    match (outcome.version, target_version) {
        (version, target) if version == target && target == CURRENT_OUTCOME_VERSION => {
            Ok(outcome.clone())
        }
        (LEGACY_OUTCOME_VERSION, CURRENT_OUTCOME_VERSION) => Ok(VersionedOutcome {
            version: CURRENT_OUTCOME_VERSION,
            outcome: outcome.outcome.clone(),
        }),
        _ => Err(ContractError::InvalidOutcomeVersion),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_outcome_without_changing_result() {
        let legacy = VersionedOutcome {
            version: LEGACY_OUTCOME_VERSION,
            outcome: Outcome::NoContest,
        };

        let migrated = migrate_outcome_version(&legacy, CURRENT_OUTCOME_VERSION).unwrap();

        assert_eq!(migrated.version, CURRENT_OUTCOME_VERSION);
        assert_eq!(migrated.outcome, Outcome::NoContest);
    }

    #[test]
    fn rejects_unsupported_source_and_target_versions() {
        let unsupported = VersionedOutcome {
            version: 99,
            outcome: Outcome::Draw,
        };

        assert_eq!(validate_outcome_version(CURRENT_OUTCOME_VERSION), Ok(()));
        assert_eq!(
            validate_outcome_version(LEGACY_OUTCOME_VERSION),
            Err(ContractError::InvalidOutcomeVersion)
        );
        assert_eq!(validate_outcome_version(99), Err(ContractError::InvalidOutcomeVersion));
        assert_eq!(
            migrate_outcome_version(&unsupported, CURRENT_OUTCOME_VERSION),
            Err(ContractError::InvalidOutcomeVersion)
        );
        assert_eq!(
            migrate_outcome_version(
                &VersionedOutcome {
                    version: LEGACY_OUTCOME_VERSION,
                    outcome: Outcome::Draw,
                },
                99,
            ),
            Err(ContractError::InvalidOutcomeVersion)
        );
    }

    #[test]
    fn rejects_report_versions_that_do_not_match_market() {
        assert_eq!(
            validate_report_outcome_version(CURRENT_OUTCOME_VERSION, CURRENT_OUTCOME_VERSION),
            Ok(())
        );
        assert_eq!(
            validate_report_outcome_version(CURRENT_OUTCOME_VERSION, LEGACY_OUTCOME_VERSION),
            Err(ContractError::InvalidOutcomeVersion)
        );
        assert_eq!(
            validate_report_outcome_version(LEGACY_OUTCOME_VERSION, LEGACY_OUTCOME_VERSION),
            Err(ContractError::InvalidOutcomeVersion)
        );
    }
}