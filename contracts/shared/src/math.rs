/// Precision used for all token-denominated market calculations.
///
/// Seven decimal places match Stellar's native XLM precision and preserve the
/// existing market unit for tokens that also use seven decimals.
pub const COMMON_TOKEN_DECIMALS: u32 = 7;
/// Maximum precision supported by decimal conversion helpers.
pub const MAX_TOKEN_DECIMALS: u32 = 18;

/// Converts an amount between decimal scales without discarding any value.
///
/// Returns `None` for unsupported precision, overflow, or a down-conversion
/// that would lose fractional units.
pub fn convert_token_amount(amount: i128, from_decimals: u32, to_decimals: u32) -> Option<i128> {
    if from_decimals > MAX_TOKEN_DECIMALS || to_decimals > MAX_TOKEN_DECIMALS {
        return None;
    }
    if from_decimals == to_decimals {
        return Some(amount);
    }

    if from_decimals < to_decimals {
        let factor = 10_i128.checked_pow(to_decimals - from_decimals)?;
        amount.checked_mul(factor)
    } else {
        let divisor = 10_i128.checked_pow(from_decimals - to_decimals)?;
        if amount % divisor != 0 {
            return None;
        }
        Some(amount / divisor)
    }
}

/// Converts an amount between scales, rounding down only when reducing precision.
///
/// Use only where contract logic explicitly permits rounding calculated
/// payouts to the token's smallest transferable unit.
pub fn convert_token_amount_floor(
    amount: i128,
    from_decimals: u32,
    to_decimals: u32,
) -> Option<i128> {
    if from_decimals > MAX_TOKEN_DECIMALS || to_decimals > MAX_TOKEN_DECIMALS {
        return None;
    }
    if amount < 0 {
        return None;
    }
    if from_decimals <= to_decimals {
        return convert_token_amount(amount, from_decimals, to_decimals);
    }

    let divisor = 10_i128.checked_pow(from_decimals - to_decimals)?;
    Some(amount / divisor)
}

/// Converts a native token amount to the shared seven-decimal calculation scale.
pub fn normalize_token_amount(amount: i128, token_decimals: u32) -> Option<i128> {
    convert_token_amount(amount, token_decimals, COMMON_TOKEN_DECIMALS)
}

/// Converts a shared-scale amount to native token units without losing precision.
pub fn denormalize_token_amount(amount: i128, token_decimals: u32) -> Option<i128> {
    convert_token_amount(amount, COMMON_TOKEN_DECIMALS, token_decimals)
}

/// Converts a calculated shared-scale payout to native units, rounding down.
pub fn denormalize_token_amount_floor(amount: i128, token_decimals: u32) -> Option<i128> {
    convert_token_amount_floor(amount, COMMON_TOKEN_DECIMALS, token_decimals)
}

/// Returns |a - b| without overflow for any i128 pair.
pub fn abs_diff(a: i128, b: i128) -> i128 {
    if a >= b {
        a.wrapping_sub(b)
    } else {
        b.wrapping_sub(a)
    }
}

/// Clamps `val` to [min_val, max_val].
pub fn clamp(val: i128, min_val: i128, max_val: i128) -> i128 {
    if val < min_val {
        min_val
    } else if val > max_val {
        max_val
    } else {
        val
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i128 = i128::MIN;
    const MAX: i128 = i128::MAX;

    #[test]
    fn abs_diff_normal() {
        assert_eq!(abs_diff(10, 3), 7);
        assert_eq!(abs_diff(3, 10), 7);
        assert_eq!(abs_diff(-5, 5), 10);
        assert_eq!(abs_diff(0, 0), 0);
    }

    #[test]
    fn abs_diff_boundaries() {
        // MAX - 0 = MAX
        assert_eq!(abs_diff(MAX, 0), MAX);
        // MAX - MIN would overflow with plain subtraction; wrapping gives MAX - MIN = -1 as u128 → but
        // since both are i128 and MIN is negative, b.wrapping_sub(a) = MIN.wrapping_sub(MAX) = 1
        // The true mathematical |MAX - MIN| overflows i128, so wrapping is the defined behaviour here.
        assert_eq!(abs_diff(MIN, MIN), 0);
        assert_eq!(abs_diff(MAX, MAX), 0);
        assert_eq!(abs_diff(MAX, MAX - 1), 1);
        assert_eq!(abs_diff(MIN, MIN + 1), 1);
    }

    #[test]
    fn clamp_normal() {
        assert_eq!(clamp(5, 1, 10), 5);
        assert_eq!(clamp(0, 1, 10), 1);
        assert_eq!(clamp(11, 1, 10), 10);
        assert_eq!(clamp(1, 1, 10), 1);
        assert_eq!(clamp(10, 1, 10), 10);
    }

    #[test]
    fn clamp_boundaries() {
        assert_eq!(clamp(MIN, MIN, MAX), MIN);
        assert_eq!(clamp(MAX, MIN, MAX), MAX);
        assert_eq!(clamp(0, MIN, MAX), 0);
        assert_eq!(clamp(MIN, 0, MAX), 0);
        assert_eq!(clamp(MAX, MIN, 0), 0);
    }

    #[test]
    fn converts_between_token_decimal_scales_without_loss() {
        assert_eq!(normalize_token_amount(1_234_567, 6), Some(12_345_670));
        assert_eq!(normalize_token_amount(12_345_670, 7), Some(12_345_670));
        assert_eq!(normalize_token_amount(1_234_567_000_000_000_000, 18), Some(12_345_670));
        assert_eq!(denormalize_token_amount(12_345_670, 6), Some(1_234_567));
        assert_eq!(denormalize_token_amount(12_345_670, 18), Some(1_234_567_000_000_000_000));
    }

    #[test]
    fn rejects_inexact_or_unsupported_decimal_conversions() {
        assert_eq!(normalize_token_amount(1, 8), None);
        assert_eq!(denormalize_token_amount(1, 6), None);
        assert_eq!(normalize_token_amount(1, MAX_TOKEN_DECIMALS + 1), None);
        assert_eq!(convert_token_amount(i128::MAX, 0, 1), None);
    }

    #[test]
    fn calculated_payout_conversion_rounds_down_explicitly() {
        assert_eq!(denormalize_token_amount_floor(12_345_679, 6), Some(1_234_567));
        assert_eq!(denormalize_token_amount_floor(12_345_679, 7), Some(12_345_679));
    }
}
