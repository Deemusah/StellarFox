import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';

export function generateSecret(accountName: string): { secret: string; otpauthUrl: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'BANKERCHANGER',
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret(),
  });
  return { secret: totp.secret.base32, otpauthUrl: totp.toString() };
}

export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a TOTP token.
 *
 * @param secret  Base32-encoded TOTP secret
 * @param token   The 6-digit code to verify
 * @param window  Allowed time-step deviation (default 0 = current step only =
 *                30 s window).  A wider window tolerates clock skew but
 *                increases the replay window, which is undesirable for a
 *                financial platform.  Only increase when clients are known
 *                to have unreliable clocks.
 *
 * The default is overridable via the TOTP_WINDOW environment variable.
 */
export function verifyToken(secret: string, token: string, window?: number): boolean {
  const effectiveWindow = window ?? parseInt(process.env.TOTP_WINDOW ?? '0', 10);
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // delta null means invalid
  return totp.validate({ token, window: effectiveWindow }) !== null;
}
