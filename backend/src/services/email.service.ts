import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env.js";

// Transactional provider — Resend if configured + domain verified; otherwise
// fall back to the Gmail SMTP account. Resend delivers much better inbox
// placement because emails are signed SPF + DKIM for our own domain.
const resend = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;

/**
 * Unified email sender. Tries Resend first (if configured); on any failure
 * falls back to the Gmail SMTP transporter so emails don't silently drop.
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<void> {
  if (resend) {
    try {
      const resp = await resend.emails.send({
        from: env.resend.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        headers: {
          "List-Unsubscribe": "<mailto:algopulseteam@gmail.com?subject=unsubscribe>",
        },
      });
      if (!resp.error) {
        return; // delivered via Resend
      }
      console.warn("[Email] Resend failed, falling back to SMTP:", resp.error.message);
    } catch (err) {
      console.warn("[Email] Resend threw, falling back to SMTP:", (err as Error).message);
    }
  }

  // Fallback — Gmail SMTP via nodemailer
  await transporter.sendMail({
    from: env.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  });
}

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: false, // STARTTLS
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

// Disposable email domains to block
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "temp-mail.org", "fakeinbox.com", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "dispostable.com", "yopmail.com", "trashmail.com", "tempail.com",
  "10minutemail.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "mohmal.com", "getnada.com", "emailondeck.com", "33mail.com",
  "mailcatch.com", "inboxkitten.com", "burnermail.io", "trash-mail.com",
  "tempr.email", "tempinbox.com", "mailsac.com", "harakirimail.com",
  "tmail.ws", "tmpmail.net", "tmpmail.org", "bupmail.com",
]);

/** Check if email domain is disposable/temporary */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return DISPOSABLE_DOMAINS.has(domain);
}

/** Generate 6-digit OTP */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Send OTP verification email */
export async function sendOTPEmail(to: string, otp: string): Promise<boolean> {
  try {
    await sendMail({
      to,
      subject: `${otp} is your CryptoX verification code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">
              Crypto<span style="color: #6366f1;">X</span>
            </h1>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Your verification code is</p>
            <p style="font-size: 36px; font-weight: 700; color: #0f172a; letter-spacing: 8px; margin: 0 0 16px;">
              ${otp}
            </p>
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              This code expires in <strong>10 minutes</strong>
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
            If you didn't request this code, you can safely ignore this email.
          </p>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              CryptoX — AI-Powered Crypto Trading
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[Email] OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send OTP to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Verify SMTP connection on startup */
/** Password reset OTP — Step 1 of forgot-password flow */
export async function sendPasswordResetOtpEmail(to: string, otp: string): Promise<boolean> {
  try {
    await sendMail({
      to,
      subject: `${otp} — Reset your AlgoPulse password`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">AlgoPulse</h1>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">Enter this code to reset your password</p>
            <p style="font-size: 36px; font-weight: 700; color: #0f172a; letter-spacing: 8px; margin: 0 0 16px;">
              ${otp}
            </p>
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              This code expires in <strong>10 minutes</strong>
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; line-height: 1.5;">
            If you didn't request a password reset, you can safely ignore this email — your account is still secure.
          </p>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              AlgoPulse — Algorithmic Crypto Trading
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Password reset OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send reset OTP to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Post-change confirmation — lets the user know their password was just changed */
export async function sendPasswordResetConfirmationEmail(to: string): Promise<boolean> {
  try {
    const when = new Date().toUTCString();
    await sendMail({
      to,
      subject: `Your AlgoPulse password was changed`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">AlgoPulse</h1>
          </div>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px;">
            <p style="font-size: 14px; font-weight: 600; color: #166534; margin: 0 0 8px;">✓ Password changed successfully</p>
            <p style="font-size: 13px; color: #15803d; margin: 0;">Changed at: <strong>${when}</strong></p>
          </div>

          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-top: 24px;">
            Your AlgoPulse account password was just changed. All your existing sessions have been logged out — please sign in again with your new password.
          </p>

          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin-top: 16px;">
            <p style="font-size: 12px; color: #991b1b; line-height: 1.5; margin: 0;">
              <strong>Didn't do this?</strong> Reset your password again immediately and contact support.
            </p>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
              AlgoPulse — Algorithmic Crypto Trading
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Password change confirmation sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send reset confirmation to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Welcome email — fired after a new user is verified (OTP or Google OAuth).
 *  Transactional-style design (minimal HTML, single column, small CTA) so Gmail
 *  treats it as a receipt rather than marketing → lands in Primary tab. */
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const rawFirst = (name || "").trim().split(" ")[0] || "";
  const looksLikeEmailSlug = rawFirst.includes("@") || /^\d/.test(rawFirst) || rawFirst.length < 2;
  const firstName = looksLikeEmailSlug ? "there" : rawFirst;

  const baseUrl = env.frontendUrl && !/localhost|:3000|:4000|3\.24\.173\.212/i.test(env.frontendUrl)
    ? env.frontendUrl
    : "https://algopulse.in";
  const dashboardUrl = `${baseUrl}/dashboard`;

  try {
    await sendMail({
      to,
      subject: `Welcome to AlgoPulse, ${firstName}`,
      text: [
        `Hey ${firstName},`,
        "",
        "Welcome to AlgoPulse — glad you're here.",
        "",
        "We built AlgoPulse for traders who'd rather let the market do the grunt work while they sleep, travel, or actually enjoy their weekends. You just joined that club.",
        "",
        "Here's what to do next:",
        "",
        "1. Connect your broker (CoinDCX, Delta India, Pi42, or Bybit) with a trade-only API key. We never touch your funds.",
        "",
        "2. Pick a strategy. Each one ships with a 3-year backtest report — see win rate, drawdown, and equity curves before you risk a single rupee.",
        "",
        "3. Deploy with one click. Monitor, pause, or stop anytime.",
        "",
        `Start here: ${dashboardUrl}`,
        "",
        "A note from us:",
        "Trading is hard. Even the best strategies lose sometimes. Start small, watch your numbers, and let data guide you — not FOMO. We're building AlgoPulse to be the platform we wished existed when we started. Glad to have you along.",
        "",
        "— The AlgoPulse Team",
      ].join("\n"),
      replyTo: "algopulseteam@gmail.com",
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to AlgoPulse</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;">Your account is ready. Three steps to deploy your first strategy.</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ffffff;"><tr><td style="padding:32px 16px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520" align="center" style="max-width:520px;margin:0 auto;">

      <tr><td style="padding:0 0 24px;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-0.2px;">AlgoPulse</span>
      </td></tr>

      <tr><td style="padding:28px 0 0;">
        <p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:#111827;">Hey ${firstName},</p>
        <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:#111827;">Welcome to AlgoPulse — glad you're here.</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#374151;">We built AlgoPulse for traders who'd rather let the market do the grunt work while they sleep, travel, or actually enjoy their weekends. You just joined that club.</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 20px;color:#374151;">Here's what to do next:</p>
      </td></tr>

      <tr><td style="padding:0 0 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;padding-top:2px;"><span style="font-size:14px;font-weight:700;color:#0089FF;">1.</span></td>
            <td style="vertical-align:top;">
              <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 4px;">Connect your broker</p>
              <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0;">Link CoinDCX, Delta India, Pi42, or Bybit with a trade-only API key. We never touch your funds.</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 0 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;padding-top:2px;"><span style="font-size:14px;font-weight:700;color:#0089FF;">2.</span></td>
            <td style="vertical-align:top;">
              <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 4px;">Pick a strategy</p>
              <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0;">Each strategy ships with a 3-year backtest report. See win rate, drawdown, and equity curves before you risk a single rupee.</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 0 28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;padding-top:2px;"><span style="font-size:14px;font-weight:700;color:#0089FF;">3.</span></td>
            <td style="vertical-align:top;">
              <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 4px;">Deploy with one click</p>
              <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0;">Monitor PnL real-time, pause anytime, stop whenever. Markets don't sleep, but you can.</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 32px;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#0089FF;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:6px;">Go to Dashboard</a>
      </td></tr>

      <tr><td style="padding:20px 0 0;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;line-height:1.7;color:#4b5563;margin:0 0 12px;">A note from us — trading is hard. Even the best strategies lose sometimes. Start small, watch your numbers, and let data guide you, not FOMO. We're building AlgoPulse to be the platform we wished existed when we started. Glad to have you along.</p>
        <p style="font-size:13px;font-weight:600;color:#111827;margin:0;">— The AlgoPulse Team</p>
      </td></tr>

      <tr><td style="padding:28px 0 0;">
        <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">AlgoPulse — Algorithmic Crypto Trading</p>
        <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.5;">You're receiving this because you just signed up for AlgoPulse.</p>
      </td></tr>

    </table>
  </td></tr></table>
</body>
</html>`,
    });
    console.log(`[Email] Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send welcome email to ${to}:`, (err as Error).message);
    return false;
  }
}

/** Verify SMTP connection on startup */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified");
    return true;
  } catch (err) {
    console.error("[Email] SMTP connection failed:", (err as Error).message);
    return false;
  }
}
